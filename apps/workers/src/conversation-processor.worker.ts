// Consumes: whatsapp.inbound queue.
// Resolves the owning clinic from the WhatsApp phone_number_id, detects new vs
// returning patients (Gap #16), monitors Meta token expiry (Gap #19), then routes
// the message to transcription (audio) or directly to the agent (text/image/document).
import { z } from 'zod'
import { transcriptionQueue, agentQueue, notificationQueue, type Job } from '@docmee/queue'
import {
  createServiceDbClient,
  createChannelAccountsRepository,
  createClinicsRepository,
  createPatientsRepository,
  createConversationsRepository,
  createMessagesRepository,
  type Channel,
  type ChannelAccount,
  type ContentType,
} from '@docmee/db'
import { firstContactMetadata } from './intake.js'

export const InboundMessageSchema = z.object({
  // Channel the message arrived on. `phoneNumberId` is the provider account id:
  // a WhatsApp phone_number_id, a Messenger Page id, or an Instagram account id.
  // `patientWaId` is the sender handle: a WhatsApp wa_id, a Messenger PSID, or
  // an Instagram IGSID.
  channel: z.enum(['whatsapp', 'messenger', 'instagram']).optional().default('whatsapp'),
  phoneNumberId: z.string(),
  patientWaId: z.string(),
  patientName: z.string().optional().default(''),
  messageType: z.enum(['text', 'audio', 'image', 'document', 'button', 'interactive']),
  content: z.string().optional(), // text messages
  mediaId: z.string().optional(), // audio/image/document
  mimeType: z.string().optional(),
  waMessageId: z.string(),
  timestamp: z.number(),
})

export type InboundMessage = z.infer<typeof InboundMessageSchema>

const TOKEN_EXPIRY_WARNING_DAYS = 7
const MS_PER_DAY = 1000 * 60 * 60 * 24

function tokenExpiresAt(account: ChannelAccount): Date | null {
  const raw = (account.settings as { tokenExpiresAt?: unknown }).tokenExpiresAt
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

// Map a Meta message type to the conversation_messages content_type domain
// ('text' | 'audio' | 'image' | 'template' | 'interactive'). Documents/buttons
// have no dedicated type, so they persist as text/interactive respectively.
function inboundContentType(messageType: InboundMessage['messageType']): ContentType {
  if (messageType === 'image') return 'image'
  if (messageType === 'interactive' || messageType === 'button') return 'interactive'
  return 'text'
}

/**
 * Unified Inbox (Req 4): thread a non-audio inbound message onto the patient's
 * open conversation (creating one if none is active) and persist it as a `user`
 * message so the inbox shows the patient's side of the thread. Returns the
 * conversation id, or null if persistence failed — the caller then enqueues the
 * agent without a conversation id (degraded, but the patient is never left on read).
 * Audio is handled separately: the transcription worker persists the voice note +
 * transcript on the same conversation (Req 8).
 */
async function threadInboundMessage(
  sql: ReturnType<typeof createServiceDbClient>,
  clinicId: string,
  channel: Channel,
  patientId: string,
  msg: InboundMessage,
): Promise<string | null> {
  try {
    const conversations = createConversationsRepository(sql)
    const existing = await conversations.findOpenByContact(clinicId, channel, msg.patientWaId)
    const conversation =
      existing ??
      (await conversations.create({
        clinicId,
        patientId,
        channel,
        channelContactHandle: msg.patientWaId,
      }))

    await createMessagesRepository(sql).create({
      conversationId: conversation.id,
      clinicId,
      role: 'user',
      content: msg.content ?? '',
      contentType: inboundContentType(msg.messageType),
      channelMessageId: msg.waMessageId,
      metadata: {
        channel,
        ...(msg.mediaId ? { mediaId: msg.mediaId } : {}),
        ...(msg.mimeType ? { mimeType: msg.mimeType } : {}),
      },
    })

    return conversation.id
  } catch (err) {
    console.error('[conversation] failed to persist inbound message:', err)
    return null
  }
}

export async function processConversationJob(job: Job): Promise<void> {
  const msg = InboundMessageSchema.parse(job.data)
  const sql = createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })

  try {
    const channel: Channel = msg.channel
    // Resolve which clinic owns the receiving account. WhatsApp resolves via the
    // channel_accounts table (per phone_number_id); Messenger resolves via the
    // clinic's connected Page id (P14); Instagram via its account id (P15).
    let clinicId: string
    let waAccessToken = ''

    if (channel === 'messenger') {
      const clinics = createClinicsRepository(sql)
      const clinic = await clinics.findByMessengerPageId(msg.phoneNumberId)
      if (!clinic) {
        console.warn(
          `[conversation] no Messenger-enabled clinic for page_id=${msg.phoneNumberId}; dropping ${msg.waMessageId}`,
        )
        return
      }
      clinicId = clinic.id
    } else if (channel === 'instagram') {
      const clinics = createClinicsRepository(sql)
      const clinic = await clinics.findByInstagramAccountId(msg.phoneNumberId)
      if (!clinic) {
        console.warn(
          `[conversation] no Instagram-enabled clinic for account_id=${msg.phoneNumberId}; dropping ${msg.waMessageId}`,
        )
        return
      }
      clinicId = clinic.id
    } else {
      const channelAccounts = createChannelAccountsRepository(sql)
      const account = await channelAccounts.findByAccount('whatsapp', msg.phoneNumberId)
      if (!account) {
        console.warn(
          `[conversation] no active WhatsApp channel account for phone_number_id=${msg.phoneNumberId}; dropping ${msg.waMessageId}`,
        )
        return
      }
      clinicId = account.clinicId
      waAccessToken = account.accessTokenEnc ?? ''

      // Gap #19: warn when the Meta access token is close to expiry.
      const expiresAt = tokenExpiresAt(account)
      if (expiresAt) {
        const daysRemaining = (expiresAt.getTime() - Date.now()) / MS_PER_DAY
        if (daysRemaining < TOKEN_EXPIRY_WARNING_DAYS) {
          await notificationQueue.add('notify', {
            clinicId,
            type: 'META_TOKEN_EXPIRING',
            daysRemaining: Math.max(0, Math.ceil(daysRemaining)),
          })
        }
      }
    }

    // Gap #16: new vs returning patient detection.
    const patients = createPatientsRepository(sql)
    const existing = await patients.findByContact(clinicId, channel, msg.patientWaId)
    const isNewPatient = !existing
    let patientId: string

    if (existing) {
      patientId = existing.id
      if (existing.status === 'new') {
        await patients.update(clinicId, existing.id, { status: 'returning' })
      }
    } else {
      // Req 10: capture name, phone (the WhatsApp handle is the phone) and source
      // (the originating channel) the moment a new patient first contacts us.
      const created = await patients.create({
        clinicId,
        fullName: msg.patientName || undefined,
        status: 'new',
        metadata: firstContactMetadata(channel, msg.patientWaId),
      })
      patientId = created.id
      await patients.addContact({
        patientId: created.id,
        clinicId,
        channel,
        contactHandle: msg.patientWaId,
        isPrimary: true,
      })
    }

    if (msg.messageType === 'audio') {
      // Transcribe first; the transcription worker re-enqueues to the agent.
      // Audio only reaches here on WhatsApp; Messenger inbound is text-only (P14).
      await transcriptionQueue.add('transcribe', {
        clinicId,
        patientId,
        patientWaId: msg.patientWaId,
        messageId: msg.waMessageId,
        mediaId: msg.mediaId,
        mimeType: msg.mimeType,
        waAccessToken,
      })
    } else {
      // Text/image/document → persist the inbound message onto the patient's
      // conversation (Req 4 Unified Inbox), then hand to the agent for intent
      // classification threaded onto that same conversation. `channel` tells the
      // agent worker which sender to reply through.
      const conversationId = await threadInboundMessage(sql, clinicId, channel, patientId, msg)
      await agentQueue.add('process', {
        clinicId,
        channel,
        patientId,
        patientWaId: msg.patientWaId,
        message: msg.content ?? '',
        waMessageId: msg.waMessageId,
        isNewPatient,
        conversationId: conversationId ?? undefined,
      })
    }
  } finally {
    await sql.end()
  }
}
