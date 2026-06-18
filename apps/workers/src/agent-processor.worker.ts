// Consumes: agent queue.
// Classifies intent, routes to the correct platform agent (P03), then for the
// botbase route runs the clinic bot and replies on WhatsApp; for an outside-hours
// silence it collects the patient's name + reason (Decision 1). calbot/alertflow
// routes stay fan-out to their downstream queues.
import { z } from 'zod'
import { classifyIntent, claudeComplete, embedText } from '@docmee/llm'
import {
  routeIntent,
  runClinicBot,
  searchKb,
  isInsideBusinessHours,
  detectLanguage,
  type BusinessHours,
  type ClinicBotConfig,
  type Language,
} from '@docmee/agents'
import { sendWhatsAppText, sendMessengerText, sendInstagramText } from '@docmee/channels'
import { schedulingQueue, notificationQueue, type Job } from '@docmee/queue'
import {
  createServiceDbClient,
  createClinicsRepository,
  createChannelAccountsRepository,
  createPatientsRepository,
  createKnowledgeRepository,
  createErrorReviewsRepository,
  createConversationsRepository,
  type Clinic,
  type Patient,
  type ChannelAccount,
} from '@docmee/db'

const AgentJobSchema = z.object({
  clinicId: z.string().uuid(),
  channel: z.enum(['whatsapp', 'messenger', 'instagram']).optional().default('whatsapp'),
  patientWaId: z.string(),
  message: z.string(),
  waMessageId: z.string(),
  patientId: z.string().uuid().optional(),
  isNewPatient: z.boolean().optional(),
  conversationId: z.string().uuid().optional(),
})

export type AgentJobData = z.infer<typeof AgentJobSchema>

// ── Clinic / patient settings extraction ────────────────────────────────────────
// Clinic bot config and business hours live in clinics.settings (jsonb); patient
// language + opt-out live in patients.metadata. All parsing is defensive.

function getBusinessHours(clinic: Clinic): BusinessHours | null {
  const hours = (clinic.settings as { businessHours?: unknown }).businessHours
  return hours && typeof hours === 'object' ? (hours as BusinessHours) : null
}

function getClinicBotConfig(clinic: Clinic): ClinicBotConfig {
  const bot = (clinic.settings as { bot?: Record<string, unknown> }).bot ?? {}
  const tone = bot.tone === 'friendly' || bot.tone === 'brief' ? bot.tone : 'professional'
  const language = bot.language === 'es' || bot.language === 'en' ? bot.language : 'auto'
  const rulesText = typeof bot.rulesText === 'string' ? bot.rulesText : null
  return { name: clinic.name, language, tone, rulesText }
}

function getPatientLanguage(patient: Patient | null): Language {
  const lang = patient ? (patient.metadata as { language?: unknown }).language : undefined
  return lang === 'en' ? 'en' : 'es'
}

function isPatientOptedOut(patient: Patient | null): boolean {
  return patient ? (patient.metadata as { optedOut?: unknown }).optedOut === true : false
}

function activeWhatsAppAccount(accounts: ChannelAccount[]): ChannelAccount | undefined {
  return accounts.find((a) => a.channel === 'whatsapp' && a.status === 'active')
}

/**
 * Resolve the outbound reply transport for the message's channel. Returns null
 * when the clinic has no usable credentials (WhatsApp account inactive, or
 * Messenger/Instagram not connected) — the caller then stays silent.
 */
function resolveSendReply(
  channel: 'whatsapp' | 'messenger' | 'instagram',
  clinic: Clinic,
  account: ChannelAccount | undefined,
  recipient: string,
): ((text: string) => Promise<void>) | null {
  if (channel === 'messenger') {
    const token = clinic.messengerEnabled ? clinic.messengerPageAccessTokenEncrypted : null
    if (!token) return null
    return (text) => sendMessengerText(token, recipient, text)
  }
  if (channel === 'instagram') {
    const token = clinic.instagramEnabled ? clinic.instagramPageAccessTokenEncrypted : null
    if (!token) return null
    return (text) => sendInstagramText(token, recipient, text)
  }
  if (!account) return null
  const phoneNumberId = account.accountId
  const accessToken = account.accessTokenEnc ?? ''
  return (text) => sendWhatsAppText(phoneNumberId, accessToken, recipient, text)
}

// ── Sentiment detection (Gap #30) ───────────────────────────────────────────────
// Cheap keyword match — no extra LLM call. An upset patient is tagged and a human
// handoff alert is fired so a secretary can step in.
const UPSET_KEYWORDS = [
  'molesto', 'enojado', 'terrible', 'horrible', 'pésimo',
  'angry', 'upset', 'awful',
  'no funciona', 'mentira', 'estafa',
]

export function detectUpsetTone(message: string): boolean {
  const lower = message.toLowerCase()
  return UPSET_KEYWORDS.some((k) => lower.includes(k))
}

function outsideHoursMessage(language: Language): string {
  return language === 'es'
    ? 'Estamos fuera de horario. Déjame tu nombre y el motivo de tu consulta y te contactamos mañana.'
    : 'We are outside business hours. Please leave your name and reason for your inquiry and we will contact you tomorrow.'
}

export async function processAgentJob(job: Job): Promise<void> {
  const data = AgentJobSchema.parse(job.data)
  const sql = createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })

  try {
    const clinics = createClinicsRepository(sql)
    const channelAccounts = createChannelAccountsRepository(sql)
    const patients = createPatientsRepository(sql)
    const knowledge = createKnowledgeRepository(sql)
    const errorReviews = createErrorReviewsRepository(sql)

    const clinic = await clinics.findById(data.clinicId)
    if (!clinic) {
      console.warn(`[agent] unknown clinic ${data.clinicId}; dropping ${data.waMessageId}`)
      return
    }

    const account = activeWhatsAppAccount(await channelAccounts.listByClinic(data.clinicId))
    const patient = data.patientId ? await patients.findById(data.clinicId, data.patientId) : null

    // Channel-aware reply transport (WhatsApp account or Messenger Page token).
    const sendReply = resolveSendReply(data.channel, clinic, account, data.patientWaId)

    const patientOptedOut = isPatientOptedOut(patient)
    const insideHours = isInsideBusinessHours(getBusinessHours(clinic), clinic.timezone)

    const intent = await classifyIntent(data.message)
    const route = routeIntent(intent, { isInsideBusinessHours: insideHours, patientOptedOut })

    // Sentiment detection + intent persistence (Gap #30 / Gap #27 metrics). Both
    // hang off the conversation row, so they only run when we know which one.
    if (data.conversationId) {
      const conversations = createConversationsRepository(sql)
      const upset = detectUpsetTone(data.message)

      const existing = await conversations.findById(data.clinicId, data.conversationId)
      if (existing) {
        await conversations.update(data.clinicId, data.conversationId, {
          metadata: { ...existing.metadata, lastIntent: intent, lastUpset: upset },
        })
      }

      if (upset) {
        // Tag the conversation and alert a human (HUMAN_HANDOFF_REQUESTED).
        const tag = await conversations.createTag({ clinicId: data.clinicId, name: 'patient_upset' })
        await conversations.addTag(data.clinicId, data.conversationId, tag.id)
        await notificationQueue.add('notify', {
          clinicId: data.clinicId,
          conversationId: data.conversationId,
          reason: 'human_handoff',
        })
      }
    }

    switch (route.agent) {
      case 'calbot':
        await schedulingQueue.add('schedule', { ...data, action: route.action })
        break

      case 'alertflow':
        await notificationQueue.add('notify', { ...data, reason: route.reason })
        break

      case 'silence':
        // Outside-hours: collect name + reason so a human can follow up (Decision 1).
        // Opt-out silence stays fully silent.
        if (route.reason === 'outside_hours' && sendReply) {
          const language = data.isNewPatient
            ? detectLanguage(data.message)
            : getPatientLanguage(patient)
          await sendReply(outsideHoursMessage(language))
        } else {
          console.log('[agent] silence route:', route.reason, data.clinicId)
        }
        break

      case 'botbase': {
        if (!sendReply) {
          console.warn(`[agent] no reply transport for clinic ${data.clinicId} on ${data.channel}; cannot reply`)
          break
        }
        const chunks = await knowledge.listEmbeddedChunks(data.clinicId)

        await runClinicBot(
          {
            clinicId: data.clinicId,
            conversationId: data.conversationId ?? null,
            patientName: patient?.fullName ?? null,
            patientLanguage: getPatientLanguage(patient),
            isFirstMessage: data.isNewPatient ?? false,
            message: data.message,
            clinic: getClinicBotConfig(clinic),
          },
          {
            searchKb: (query) => searchKb(query, chunks, embedText),
            complete: claudeComplete,
            sendText: (text) => sendReply(text),
            logError: (info) =>
              errorReviews
                .create({
                  clinicId: info.clinicId,
                  errorType: info.errorType,
                  errorMessage: info.message,
                  context: { conversationId: info.conversationId, rawMessage: info.rawMessage },
                })
                .then(() => {}),
          },
        )
        break
      }
    }
  } finally {
    await sql.end()
  }
}
