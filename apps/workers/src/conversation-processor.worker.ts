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
  type Channel,
  type ChannelAccount,
} from '@docmee/db'

export const InboundMessageSchema = z.object({
  // Channel the message arrived on. `phoneNumberId` is the provider account id:
  // a WhatsApp phone_number_id, or a Messenger Page id. `patientWaId` is the
  // sender handle: a WhatsApp wa_id, or a Messenger PSID.
  channel: z.enum(['whatsapp', 'messenger']).optional().default('whatsapp'),
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

export async function processConversationJob(job: Job): Promise<void> {
  const msg = InboundMessageSchema.parse(job.data)
  const sql = createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })

  try {
    const channel: Channel = msg.channel
    // Resolve which clinic owns the receiving account. WhatsApp resolves via the
    // channel_accounts table (per phone_number_id); Messenger resolves via the
    // clinic's connected Page id (P14).
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
      const created = await patients.create({
        clinicId,
        fullName: msg.patientName || undefined,
        status: 'new',
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
      // Text/image/document → straight to the agent for intent classification.
      // `channel` tells the agent worker which sender to reply through.
      await agentQueue.add('process', {
        clinicId,
        channel,
        patientId,
        patientWaId: msg.patientWaId,
        message: msg.content ?? '',
        waMessageId: msg.waMessageId,
        isNewPatient,
      })
    }
  } finally {
    await sql.end()
  }
}
