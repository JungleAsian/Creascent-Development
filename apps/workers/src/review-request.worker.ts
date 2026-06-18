// Consumes: review-request queue (Gap #37 — review automation).
//
// A periodic tick scans each clinic for appointments completed between 48h and 7
// days ago that have not yet had a review request, and sends one over WhatsApp:
//   "¿Cómo fue tu experiencia con [Doctor]? Déjanos tu opinión: [link]"
// Opted-out patients are never messaged. Each send is recorded in follow_ups (so
// it fires exactly once) and, when a tracking base URL is configured, the link is
// a redirector that stamps review_clicked.
import { sendWhatsAppText } from '@docmee/channels'
import { type Job } from '@docmee/queue'
import {
  createServiceDbClient,
  createClinicsRepository,
  createAppointmentsRepository,
  createDoctorsRepository,
  createPatientsRepository,
  createChannelAccountsRepository,
  createFollowUpsRepository,
  type Clinic,
  type Patient,
  type ChannelAccount,
  type PatientContact,
} from '@docmee/db'

export const REVIEW_FOLLOW_UP_TYPE = 'review_request'

const REVIEW_DELAY_HOURS = 48
const REVIEW_WINDOW_DAYS = 7

type Language = 'es' | 'en'

function getPatientLanguage(patient: Patient): Language {
  return (patient.metadata as { language?: unknown }).language === 'en' ? 'en' : 'es'
}

function isPatientOptedOut(patient: Patient): boolean {
  return (patient.metadata as { optedOut?: unknown }).optedOut === true
}

function activeWhatsAppAccount(accounts: ChannelAccount[]): ChannelAccount | undefined {
  return accounts.find((a) => a.channel === 'whatsapp' && a.status === 'active')
}

function primaryWhatsAppHandle(contacts: PatientContact[]): string | null {
  const whatsapp = contacts.filter((c) => c.channel === 'whatsapp')
  return (whatsapp.find((c) => c.isPrimary) ?? whatsapp[0])?.contactHandle ?? null
}

function getReviewLink(clinic: Clinic): string | null {
  const link = (clinic.settings as { reviewLink?: unknown }).reviewLink
  return typeof link === 'string' && link ? link : null
}

/** Tracking redirect if a public base URL is set; otherwise the raw review link. */
export function buildReviewLink(followUpId: string, fallback: string): string {
  const base = process.env['PUBLIC_API_URL']?.replace(/\/$/, '')
  return base ? `${base}/r/${followUpId}` : fallback
}

function reviewMessage(language: Language, doctorName: string, link: string): string {
  return language === 'en'
    ? `How was your experience with ${doctorName}? Leave us your feedback: ${link}`
    : `¿Cómo fue tu experiencia con ${doctorName}? Déjanos tu opinión: ${link}`
}

export async function processReviewRequestJob(_job: Job): Promise<void> {
  const sql = createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })
  const now = new Date()
  const to = new Date(now.getTime() - REVIEW_DELAY_HOURS * 60 * 60 * 1000)
  const from = new Date(now.getTime() - REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  try {
    const clinics = createClinicsRepository(sql)
    const appointments = createAppointmentsRepository(sql)
    const doctors = createDoctorsRepository(sql)
    const patients = createPatientsRepository(sql)
    const channelAccounts = createChannelAccountsRepository(sql)
    const followUps = createFollowUpsRepository(sql)

    for (const clinic of await clinics.list()) {
      if (clinic.status !== 'active') continue

      const reviewLink = getReviewLink(clinic)
      if (!reviewLink) continue // nothing to point patients at

      const completed = await appointments.listCompletedForReview(
        clinic.id,
        from.toISOString(),
        to.toISOString(),
      )
      if (completed.length === 0) continue

      const account = activeWhatsAppAccount(await channelAccounts.listByClinic(clinic.id))
      if (!account) continue

      const doctorList = await doctors.listByClinic(clinic.id)

      for (const appt of completed) {
        // Claim this (appointment, type) exactly once.
        const followUp = await followUps.createIfAbsent({
          clinicId: clinic.id,
          patientId: appt.patientId,
          appointmentId: appt.id,
          type: REVIEW_FOLLOW_UP_TYPE,
        })
        if (!followUp) continue // already handled in a prior run

        const patient = await patients.findById(clinic.id, appt.patientId)
        if (!patient || isPatientOptedOut(patient)) continue

        const handle = primaryWhatsAppHandle(await patients.listContacts(clinic.id, appt.patientId))
        if (!handle) continue

        const doctorName =
          doctorList.find((d) => d.id === appt.doctorId)?.name ??
          (getPatientLanguage(patient) === 'en' ? 'your doctor' : 'tu doctor')
        const link = buildReviewLink(followUp.id, reviewLink)
        const text = reviewMessage(getPatientLanguage(patient), doctorName, link)

        await sendWhatsAppText(account.accountId, account.accessTokenEnc ?? '', handle, text)
        await followUps.markSent(clinic.id, followUp.id)
      }
    }
  } finally {
    await sql.end()
  }
}
