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
import { sendWhatsAppText } from '@docmee/channels'
import { schedulingQueue, notificationQueue, type Job } from '@docmee/queue'
import {
  createServiceDbClient,
  createClinicsRepository,
  createChannelAccountsRepository,
  createPatientsRepository,
  createKnowledgeRepository,
  createErrorReviewsRepository,
  type Clinic,
  type Patient,
  type ChannelAccount,
} from '@docmee/db'

const AgentJobSchema = z.object({
  clinicId: z.string().uuid(),
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

    const patientOptedOut = isPatientOptedOut(patient)
    const insideHours = isInsideBusinessHours(getBusinessHours(clinic), clinic.timezone)

    const intent = await classifyIntent(data.message)
    const route = routeIntent(intent, { isInsideBusinessHours: insideHours, patientOptedOut })

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
        if (route.reason === 'outside_hours' && account) {
          const language = data.isNewPatient
            ? detectLanguage(data.message)
            : getPatientLanguage(patient)
          await sendWhatsAppText(
            account.accountId,
            account.accessTokenEnc ?? '',
            data.patientWaId,
            outsideHoursMessage(language),
          )
        } else {
          console.log('[agent] silence route:', route.reason, data.clinicId)
        }
        break

      case 'botbase': {
        if (!account) {
          console.warn(`[agent] no active WhatsApp account for clinic ${data.clinicId}; cannot reply`)
          break
        }
        const phoneNumberId = account.accountId
        const accessToken = account.accessTokenEnc ?? ''
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
            sendText: (text) => sendWhatsAppText(phoneNumberId, accessToken, data.patientWaId, text),
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
