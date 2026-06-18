// Consumes: follow-up queue.
//
// Phase-2 follow-up automation (Gap #28). Producers schedule a delayed job for one
// of the seven follow-up types; when it fires this worker resolves the patient's
// WhatsApp contact and sends the matching message — UNLESS the patient has opted
// out, in which case it stays fully silent (never message an opted-out patient).
//
// Scheduling (delayed jobs) is owned by the producer, e.g. after an appointment:
//   await followUpQueue.add('follow-up', payload, { delay: 24 * 60 * 60 * 1000 })
import { z } from 'zod'
import { sendWhatsAppText } from '@docmee/channels'
import { followUpQueue, type Job } from '@docmee/queue'
import {
  createServiceDbClient,
  createClinicsRepository,
  createPatientsRepository,
  createChannelAccountsRepository,
  type Patient,
  type ChannelAccount,
  type PatientContact,
} from '@docmee/db'

export const FOLLOW_UP_TYPES = {
  POST_APPOINTMENT: 'post_appointment', // 24h after appointment
  MISSED_APPOINTMENT: 'missed_appointment', // patient didn't show
  NO_SHOW_REBOOKING: 'no_show_rebooking', // offer rebooking after no-show
  PENDING_REPLY: 'pending_reply', // tagged pending_reply > 24h
  STALE_INTAKE: 'stale_intake', // started booking but didn't finish
  REVIEW_REQUEST: 'review_request', // 48h after appointment
  REACTIVATION: 'reactivation', // patient inactive > 30 days
} as const

export type FollowUpType = (typeof FOLLOW_UP_TYPES)[keyof typeof FOLLOW_UP_TYPES]

const FollowUpJobSchema = z.object({
  clinicId: z.string().uuid(),
  patientId: z.string().uuid(),
  type: z.enum([
    FOLLOW_UP_TYPES.POST_APPOINTMENT,
    FOLLOW_UP_TYPES.MISSED_APPOINTMENT,
    FOLLOW_UP_TYPES.NO_SHOW_REBOOKING,
    FOLLOW_UP_TYPES.PENDING_REPLY,
    FOLLOW_UP_TYPES.STALE_INTAKE,
    FOLLOW_UP_TYPES.REVIEW_REQUEST,
    FOLLOW_UP_TYPES.REACTIVATION,
  ]),
})

export type FollowUpJobData = z.infer<typeof FollowUpJobSchema>

type Language = 'es' | 'en'

const MESSAGES: Record<FollowUpType, Record<Language, string>> = {
  post_appointment: {
    es: '¡Hola! Esperamos que tu cita haya ido bien. ¿Cómo te sientes? Estamos aquí si necesitas algo.',
    en: 'Hi! We hope your appointment went well. How are you feeling? We are here if you need anything.',
  },
  missed_appointment: {
    es: 'Notamos que no pudiste asistir a tu cita. ¿Te gustaría reagendar? Estamos para ayudarte.',
    en: 'We noticed you missed your appointment. Would you like to reschedule? We are happy to help.',
  },
  no_show_rebooking: {
    es: 'Aún tienes un espacio disponible para reagendar tu cita. Responde a este mensaje y te ayudamos a coordinar una nueva fecha.',
    en: 'You can still rebook your appointment. Reply to this message and we will help you find a new date.',
  },
  pending_reply: {
    es: 'Seguimos pendientes de tu mensaje. ¿Aún podemos ayudarte con algo?',
    en: 'We are still following up on your message. Is there anything we can help you with?',
  },
  stale_intake: {
    es: 'Vimos que empezaste a agendar una cita pero no la terminaste. ¿Quieres que la completemos juntos?',
    en: 'We saw you started booking an appointment but did not finish. Would you like us to complete it together?',
  },
  review_request: {
    es: '¡Gracias por tu visita! Tu opinión nos ayuda a mejorar. ¿Nos compartirías cómo fue tu experiencia?',
    en: 'Thank you for your visit! Your feedback helps us improve. Would you share how your experience was?',
  },
  reactivation: {
    es: 'Ha pasado un tiempo desde tu última visita. Estamos aquí cuando quieras agendar una nueva cita.',
    en: 'It has been a while since your last visit. We are here whenever you would like to book a new appointment.',
  },
}

function getPatientLanguage(patient: Patient): Language {
  const lang = (patient.metadata as { language?: unknown }).language
  return lang === 'en' ? 'en' : 'es'
}

function isPatientOptedOut(patient: Patient): boolean {
  return (patient.metadata as { optedOut?: unknown }).optedOut === true
}

function activeWhatsAppAccount(accounts: ChannelAccount[]): ChannelAccount | undefined {
  return accounts.find((a) => a.channel === 'whatsapp' && a.status === 'active')
}

function primaryWhatsAppHandle(contacts: PatientContact[]): string | null {
  const whatsapp = contacts.filter((c) => c.channel === 'whatsapp')
  const primary = whatsapp.find((c) => c.isPrimary) ?? whatsapp[0]
  return primary?.contactHandle ?? null
}

/** Schedule a follow-up message to fire after `delayMs`. */
export async function scheduleFollowUp(data: FollowUpJobData, delayMs: number): Promise<void> {
  await followUpQueue.add('follow-up', data, { delay: delayMs })
}

export async function processFollowUpJob(job: Job): Promise<void> {
  const data = FollowUpJobSchema.parse(job.data)
  const sql = createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })

  try {
    const clinics = createClinicsRepository(sql)
    const patients = createPatientsRepository(sql)
    const channelAccounts = createChannelAccountsRepository(sql)

    const clinic = await clinics.findById(data.clinicId)
    if (!clinic) {
      console.warn(`[follow-up] unknown clinic ${data.clinicId}; dropping ${data.type}`)
      return
    }

    const patient = await patients.findById(data.clinicId, data.patientId)
    if (!patient) {
      console.warn(`[follow-up] unknown patient ${data.patientId}; dropping ${data.type}`)
      return
    }

    // Never message a patient who has opted out.
    if (isPatientOptedOut(patient)) {
      console.log(`[follow-up] patient ${data.patientId} opted out; skipping ${data.type}`)
      return
    }

    const account = activeWhatsAppAccount(await channelAccounts.listByClinic(data.clinicId))
    if (!account) {
      console.warn(`[follow-up] no active WhatsApp account for clinic ${data.clinicId}; cannot send`)
      return
    }

    const handle = primaryWhatsAppHandle(await patients.listContacts(data.clinicId, data.patientId))
    if (!handle) {
      console.warn(`[follow-up] patient ${data.patientId} has no WhatsApp contact; skipping`)
      return
    }

    const text = MESSAGES[data.type][getPatientLanguage(patient)]
    await sendWhatsAppText(account.accountId, account.accessTokenEnc ?? '', handle, text)
  } finally {
    await sql.end()
  }
}
