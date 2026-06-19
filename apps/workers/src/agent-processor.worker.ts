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
  matchCustomFlow,
  isBotPaused,
  detectHumanRequest,
  isEmergencyMessage,
  emergencyNotice,
  handoffNotice,
  BOT_PAUSED_AT,
  HANDOFF_REASON,
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
  createCustomFlowsRepository,
  type Sql,
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

/**
 * Bilingual bot (Req 22): persist the patient's language to patients.metadata so
 * every later turn replies in the SAME language. Without this, getPatientLanguage
 * falls back to 'es' on message 2+ and an English-speaking patient is answered in
 * Spanish after their first message. Idempotent: only writes when the stored value
 * actually changes, and is a no-op for an unknown (null) patient.
 */
async function persistPatientLanguage(
  patients: ReturnType<typeof createPatientsRepository>,
  clinicId: string,
  patient: Patient | null,
  language: Language,
): Promise<void> {
  if (!patient) return
  const current = (patient.metadata as { language?: unknown }).language
  if (current === language) return
  await patients.update(clinicId, patient.id, {
    metadata: { ...patient.metadata, language },
  })
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

/**
 * P18 (Gap #34): if an enabled custom flow's trigger matches, run its scripted
 * messages + optional terminal action and return true (caller skips the LLM).
 */
async function runMatchingCustomFlow(
  sql: Sql,
  data: AgentJobData,
  patient: Patient | null,
  sendReply: (text: string) => Promise<void>,
): Promise<boolean> {
  const flows = await createCustomFlowsRepository(sql).listEnabled(data.clinicId)
  if (flows.length === 0) return false

  const language = data.isNewPatient ? detectLanguage(data.message) : getPatientLanguage(patient)
  const matched = matchCustomFlow(
    data.message,
    flows.map((f) => ({
      id: f.id,
      triggerKeywords: f.triggerKeywords,
      messages: f.messages,
      action: f.action,
      language: f.language,
    })),
    language,
  )
  if (!matched) return false

  for (const text of matched.messages) await sendReply(text)

  if (data.conversationId) {
    const conversations = createConversationsRepository(sql)
    const existing = await conversations.findById(data.clinicId, data.conversationId)
    if (existing) {
      await conversations.update(data.clinicId, data.conversationId, {
        metadata: { ...existing.metadata, lastIntent: 'custom_flow', customFlowId: matched.id },
      })
    }
  }

  if (matched.action === 'book') {
    await schedulingQueue.add('schedule', { ...data, action: 'book' })
  } else if (matched.action === 'handoff') {
    await notificationQueue.add('notify', { ...data, reason: 'human_handoff' })
  }
  return true
}

/**
 * Pause the bot for a human handoff (Rev1 #5/#6): flip the conversation to
 * `handoff` and stamp who/why so the inbox shows the bot is off and the timeout
 * monitor can later reactivate it. No-op when the job carries no conversation id.
 */
async function pauseBotForHandoff(
  conversations: ReturnType<typeof createConversationsRepository>,
  data: AgentJobData,
  currentMetadata: Record<string, unknown> | undefined,
  reason: string,
): Promise<void> {
  if (!data.conversationId) return
  await conversations.update(data.clinicId, data.conversationId, {
    status: 'handoff',
    metadata: {
      ...(currentMetadata ?? {}),
      [BOT_PAUSED_AT]: new Date().toISOString(),
      [HANDOFF_REASON]: reason,
    },
  })
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

    const conversations = createConversationsRepository(sql)
    const conversation = data.conversationId
      ? await conversations.findById(data.clinicId, data.conversationId)
      : null

    // Bot Interruption Rule (Rev1 #6): once a human owns the conversation
    // (assigned/handoff) or it is closed (resolved), the bot stays completely
    // silent — no custom flow, no LLM, no auto-reply. Control returns to the bot
    // only when the conversation is reactivated to `open` (manual resume or the
    // reactivation timeout), at which point a later message routes normally.
    if (conversation && isBotPaused(conversation.status)) {
      console.log(`[agent] conversation ${conversation.id} is human-owned (${conversation.status}); bot silent`)
      return
    }

    const patientLanguage = data.isNewPatient
      ? detectLanguage(data.message)
      : getPatientLanguage(patient)

    // Bilingual bot (Req 22): capture the language from the patient's FIRST message
    // so every later turn — and any non-bot route (calbot booking, alertflow) — can
    // answer in the same language. The botbase route re-persists the bot's resolved
    // language below in case the clinic forces a fixed reply language.
    if (data.isNewPatient) {
      await persistPatientLanguage(patients, data.clinicId, patient, patientLanguage)
    }

    // Auto-tag a brand-new patient's conversation (Req 11). Runs on first contact,
    // before any routing branch returns, so the `new_patient` tag is applied no
    // matter how the message routes (bot / emergency / handoff). createTag upserts
    // and addTag is ON CONFLICT DO NOTHING, so this is idempotent.
    if (data.conversationId && conversation && data.isNewPatient) {
      const tag = await conversations.createTag({
        clinicId: data.clinicId,
        name: 'new_patient',
        color: '#16a34a',
      })
      await conversations.addTag(data.clinicId, data.conversationId, tag.id)
    }

    // Medical emergency (Req 20: emergency routing). A cheap pre-LLM keyword check
    // runs FIRST — before business hours, opt-out, custom flows and intent
    // classification — so a true emergency (chest pain, can't breathe, bleeding,
    // suicide…) is never silenced by the outside-hours rule, never waits on the
    // model, and is never answered by the bot. We reassure the patient and point
    // them at local emergency services, pause the bot, tag the conversation, and
    // raise the highest-priority alert. Safety overrides opt-out here by design.
    if (sendReply && isEmergencyMessage(data.message)) {
      await sendReply(emergencyNotice(patientLanguage))
      if (data.conversationId && conversation) {
        const tag = await conversations.createTag({ clinicId: data.clinicId, name: 'emergency' })
        await conversations.addTag(data.clinicId, data.conversationId, tag.id)
        await pauseBotForHandoff(conversations, data, conversation.metadata, 'emergency')
      }
      await notificationQueue.add('notify', {
        clinicId: data.clinicId,
        conversationId: data.conversationId,
        reason: 'emergency',
      })
      return
    }

    // Explicit "connect me with a human" request (Rev1 #5). Cheap keyword check so
    // an unambiguous request hands off reliably without waiting on the LLM: ack the
    // patient, pause the bot (status → handoff), and alert a human.
    if (sendReply && detectHumanRequest(data.message)) {
      await sendReply(handoffNotice(patientLanguage))
      if (conversation) {
        await pauseBotForHandoff(conversations, data, conversation.metadata, 'patient_request')
      }
      await notificationQueue.add('notify', {
        clinicId: data.clinicId,
        conversationId: data.conversationId,
        reason: 'human_handoff',
      })
      return
    }

    // P18 (Gap #34): custom flows run BEFORE intent classification. A keyword match
    // runs the clinic's scripted message sequence (and optional terminal action)
    // and skips the LLM entirely.
    if (sendReply && (await runMatchingCustomFlow(sql, data, patient, sendReply))) {
      return
    }

    const patientOptedOut = isPatientOptedOut(patient)
    const insideHours = isInsideBusinessHours(getBusinessHours(clinic), clinic.timezone)

    const intent = await classifyIntent(data.message)
    const route = routeIntent(intent, { isInsideBusinessHours: insideHours, patientOptedOut })

    // Sentiment detection + intent persistence (Gap #30 / Gap #27 metrics). Both
    // hang off the conversation row, so they only run when we know which one.
    if (data.conversationId && conversation) {
      const upset = detectUpsetTone(data.message)

      await conversations.update(data.clinicId, data.conversationId, {
        metadata: { ...conversation.metadata, lastIntent: intent, lastUpset: upset },
      })

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
        // An emergency the keyword guard missed but the classifier caught still
        // needs the same patient-facing reassurance + bot pause as the keyword path
        // (the keyword check only fires on a fixed phrase list).
        if (route.reason === 'emergency') {
          if (sendReply) await sendReply(emergencyNotice(patientLanguage))
          if (conversation) {
            await pauseBotForHandoff(conversations, data, conversation.metadata, 'emergency')
          }
        }
        await notificationQueue.add('notify', { ...data, reason: route.reason })
        break

      case 'silence':
        // Outside-hours: collect name + reason so a human can follow up (Decision 1).
        // Opt-out silence stays fully silent.
        if (route.reason === 'outside_hours' && sendReply) {
          await sendReply(outsideHoursMessage(patientLanguage))
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
        let kbHit = false

        const botResult = await runClinicBot(
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
            searchKb: async (query) => {
              const matches = await searchKb(query, chunks, embedText)
              if (matches.length > 0) kbHit = true
              return matches
            },
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

        // Bilingual bot (Req 22): persist the language the bot actually replied in
        // (resolveLanguage honors a clinic-forced language over raw detection) so
        // subsequent turns stay consistent.
        await persistPatientLanguage(patients, data.clinicId, patient, botResult.language)

        // Record KB usage for the analytics KB-hit rate (Gap #39). Re-read so we
        // merge onto the metadata the sentiment block just persisted.
        if (kbHit && data.conversationId) {
          const existing = await conversations.findById(data.clinicId, data.conversationId)
          if (existing) {
            await conversations.update(data.clinicId, data.conversationId, {
              metadata: { ...existing.metadata, kbHit: true },
            })
          }
        }
        break
      }
    }
  } finally {
    await sql.end()
  }
}
