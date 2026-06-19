// Consumes: scheduling queue (enqueued by the agent worker for calbot routes).
//
// Routes each job to the matching scheduling flow:
//   book       → advanceBookingFlow
//   reschedule → advanceRescheduleFlow
//   cancel     → advanceCancelFlow
//   status     → buildStatusReply
//
// Multi-turn flow state is persisted in conversations.metadata.scheduling so the
// next inbound message resumes where the patient left off. Google Calendar access
// is bound from the clinic's encrypted OAuth tokens (clinics.settings.googleCalendar).
import { z } from 'zod'
import { decryptValue, encryptValue } from '@docmee/shared'
import {
  detectLanguage,
  createGoogleCalendarOps,
  advanceBookingFlow,
  initialBookingState,
  advanceRescheduleFlow,
  initialRescheduleState,
  advanceCancelFlow,
  initialCancelState,
  buildStatusReply,
  normalizeAvailability,
  type CalendarOps,
  type Language,
  type ProviderRef,
  type UpcomingAppointment,
  type BookingState,
  type RescheduleState,
  type CancelState,
  type RefreshedTokens,
} from '@docmee/agents'
import { sendWhatsAppText } from '@docmee/channels'
import { notificationQueue, type Job } from '@docmee/queue'
import { patientSource, mergePatientIntake, type BookingIntake } from './intake.js'
import { scheduleAppointmentFollowUps, scheduleNoResponseFollowUp } from './follow-up.js'
import {
  createServiceDbClient,
  createClinicsRepository,
  createPatientsRepository,
  createConversationsRepository,
  createAppointmentsRepository,
  createChannelAccountsRepository,
  createDoctorsRepository,
  createErrorReviewsRepository,
  type Clinic,
  type Patient,
  type ChannelAccount,
  type Appointment,
  type Provider,
  type Doctor,
} from '@docmee/db'

const SchedulingJobSchema = z.object({
  clinicId: z.string().uuid(),
  patientWaId: z.string(),
  message: z.string(),
  waMessageId: z.string(),
  patientId: z.string().uuid().optional(),
  isNewPatient: z.boolean().optional(),
  conversationId: z.string().uuid().optional(),
  action: z.enum(['book', 'reschedule', 'cancel', 'status']),
})

export type SchedulingJobData = z.infer<typeof SchedulingJobSchema>
type Action = SchedulingJobData['action']

interface CalendarConfig {
  accessToken: string
  refreshToken: string
  calendarId: string
  expiryDate?: number
}

// Per-action persisted state lives under conversations.metadata.scheduling.
type StoredFlow =
  | { action: 'book'; state: BookingState }
  | { action: 'reschedule'; state: RescheduleState }
  | { action: 'cancel'; state: CancelState }

function getPatientLanguage(patient: Patient | null): Language {
  const lang = patient ? (patient.metadata as { language?: unknown }).language : undefined
  return lang === 'en' ? 'en' : 'es'
}

function activeWhatsAppAccount(accounts: ChannelAccount[]): ChannelAccount | undefined {
  return accounts.find((a) => a.channel === 'whatsapp' && a.status === 'active')
}

// P18 (Gap #32): a doctor's own Google Calendar, decrypted from their row.
// Returns null when the doctor has no calendar connected (→ fall back to clinic).
function getDoctorCalendarConfig(doctor: Doctor): CalendarConfig | null {
  const acc = doctor.googleCalendarAccessTokenEncrypted
  const ref = doctor.googleCalendarRefreshTokenEncrypted
  if (!acc || !ref) return null
  try {
    return {
      accessToken: decryptValue(acc),
      refreshToken: decryptValue(ref),
      calendarId: doctor.googleCalendarId ?? 'primary',
    }
  } catch {
    return null
  }
}

// Persist a refreshed Google access token back onto a doctor's row so the next
// job reuses it instead of refreshing again. Best-effort: a write failure is
// logged but never breaks the in-flight scheduling reply.
function persistDoctorTokens(
  sql: ReturnType<typeof createServiceDbClient>,
  clinicId: string,
  doctorId: string,
): (t: RefreshedTokens) => Promise<void> {
  return async (t) => {
    try {
      await createDoctorsRepository(sql).update(clinicId, doctorId, {
        googleCalendarAccessTokenEncrypted: encryptValue(t.accessToken),
        ...(t.refreshToken ? { googleCalendarRefreshTokenEncrypted: encryptValue(t.refreshToken) } : {}),
      })
    } catch (e) {
      console.error(`[scheduling] failed to persist refreshed doctor calendar tokens for ${doctorId}`, e)
    }
  }
}

// Placeholder bound to the booking flow on early turns (doctor not yet chosen) when
// no clinic calendar exists. The flow never touches the calendar before a doctor is
// selected, so these throws are unreachable in practice — they guard against misuse.
const unconfiguredCalendar: CalendarOps = {
  listSlots: () => Promise.reject(new Error('calendar not configured')),
  createEvent: () => Promise.reject(new Error('calendar not configured')),
  updateEvent: () => Promise.reject(new Error('calendar not configured')),
  deleteEvent: () => Promise.reject(new Error('calendar not configured')),
}

function getCalendarConfig(clinic: Clinic): CalendarConfig | null {
  const gc = (clinic.settings as { googleCalendar?: unknown }).googleCalendar
  if (!gc || typeof gc !== 'object') return null
  const { accessToken, refreshToken, calendarId, expiryDate } = gc as Record<string, unknown>
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null
  try {
    return {
      accessToken: decryptValue(accessToken),
      refreshToken: decryptValue(refreshToken),
      calendarId: typeof calendarId === 'string' ? calendarId : 'primary',
      ...(typeof expiryDate === 'number' ? { expiryDate } : {}),
    }
  } catch {
    // Tokens unreadable (rotated key / corruption) → treat as not connected.
    return null
  }
}

function toProviderRef(p: Provider): ProviderRef {
  return { id: p.id, fullName: p.fullName, specialty: p.specialty }
}

function toUpcoming(appt: Appointment, providers: Provider[]): UpcomingAppointment {
  const provider = providers.find((p) => p.id === appt.providerId)
  return {
    id: appt.id,
    providerId: appt.providerId ?? appt.doctorId ?? '',
    providerName: provider?.fullName ?? 'el doctor',
    date: appt.startTime.slice(0, 10),
    time: appt.startTime.slice(11, 16),
    googleEventId: appt.googleEventId,
  }
}

function isUpcoming(appt: Appointment, nowIso: string): boolean {
  return (appt.status === 'pending' || appt.status === 'confirmed') && appt.startTime > nowIso
}

function loadStoredFlow(metadata: Record<string, unknown>, action: Action): StoredFlow | null {
  const stored = metadata['scheduling']
  if (stored && typeof stored === 'object' && (stored as StoredFlow).action === action) {
    return stored as StoredFlow
  }
  return null
}

export async function processSchedulingJob(job: Job): Promise<void> {
  const data = SchedulingJobSchema.parse(job.data)
  const sql = createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })

  try {
    const clinics = createClinicsRepository(sql)
    const patients = createPatientsRepository(sql)
    const conversations = createConversationsRepository(sql)
    const appointments = createAppointmentsRepository(sql)
    const channelAccounts = createChannelAccountsRepository(sql)

    const clinic = await clinics.findById(data.clinicId)
    if (!clinic) {
      console.warn(`[scheduling] unknown clinic ${data.clinicId}; dropping ${data.waMessageId}`)
      return
    }

    const account = activeWhatsAppAccount(await channelAccounts.listByClinic(data.clinicId))
    if (!account) {
      console.warn(`[scheduling] no active WhatsApp account for clinic ${data.clinicId}; cannot reply`)
      return
    }

    const patient = data.patientId ? await patients.findById(data.clinicId, data.patientId) : null
    const language: Language = data.isNewPatient ? detectLanguage(data.message) : getPatientLanguage(patient)
    const clinicInfo = { name: clinic.name, timezone: clinic.timezone }

    const reply = async (text: string) =>
      sendWhatsAppText(account.accountId, account.accessTokenEnc ?? '', data.patientWaId, text)

    // Scheduling needs a known patient (to own the appointment row).
    if (!data.patientId) {
      await notificationQueue.add('notify', { ...data, reason: 'human_handoff' })
      return
    }
    const patientId = data.patientId

    const conversation = data.conversationId
      ? await conversations.findById(data.clinicId, data.conversationId)
      : null
    const metadata: Record<string, unknown> = conversation ? { ...conversation.metadata } : {}
    // Whether a multi-turn flow was already mid-stream when this message arrived.
    // Used to schedule the no_response nudge only on the FIRST turn we start waiting
    // on the patient, so a long booking conversation doesn't queue a nudge per turn.
    const hadStoredFlow = metadata['scheduling'] != null

    const providers = await appointments.listProviders(data.clinicId)
    const calendarConfig = getCalendarConfig(clinic)

    // Persist a refreshed clinic access token back into clinics.settings so the
    // next job reuses it (best-effort; re-reads the row to merge against the
    // latest settings rather than the snapshot taken at the top of the job).
    const persistClinicTokens = async (t: RefreshedTokens): Promise<void> => {
      try {
        const fresh = await clinics.findById(data.clinicId)
        const gc = fresh
          ? (fresh.settings as { googleCalendar?: Record<string, unknown> }).googleCalendar
          : null
        if (!fresh || !gc) return
        await clinics.update(data.clinicId, {
          settings: {
            ...fresh.settings,
            googleCalendar: {
              ...gc,
              accessToken: encryptValue(t.accessToken),
              ...(t.refreshToken ? { refreshToken: encryptValue(t.refreshToken) } : {}),
              ...(typeof t.expiryDate === 'number' ? { expiryDate: t.expiryDate } : {}),
            },
          },
        })
      } catch (e) {
        console.error(`[scheduling] failed to persist refreshed clinic calendar tokens for ${data.clinicId}`, e)
      }
    }

    const calendar: CalendarOps | null = calendarConfig
      ? createGoogleCalendarOps({ ...calendarConfig, timezone: clinic.timezone, onTokensRefreshed: persistClinicTokens })
      : null

    const patientAppointments = await appointments.listByPatient(data.clinicId, patientId)
    const nowIso = new Date().toISOString()
    const upcoming = patientAppointments.filter((a) => isUpcoming(a, nowIso))

    let nextFlow: StoredFlow | null = null

    // Calendar failures (Req 29 Error Review): a Google Calendar call inside any
    // scheduling flow can throw (expired/revoked OAuth token, API outage, quota).
    // Rather than let the job fail and retry — which risks a double-book or a
    // double-send — we record the failure to error_reviews for operator review,
    // tell the patient a human will follow up, and hand off. Best-effort logging.
    try {
      switch (data.action) {
      case 'status': {
        const result = buildStatusReply({
          language,
          clinic: clinicInfo,
          appointments: upcoming.map((a) => toUpcoming(a, providers)),
        })
        await reply(result.reply)
        break
      }

      case 'cancel': {
        const stored = loadStoredFlow(metadata, 'cancel')
        const state = stored?.action === 'cancel' ? stored.state : initialCancelState()
        const result = await advanceCancelFlow(state, data.message, { language, appointment: upcoming[0] ? toUpcoming(upcoming[0], providers) : null }, {
          deleteEvent: async (eventId) => {
            if (calendar) await calendar.deleteEvent(eventId)
          },
          markCancelled: async (appointmentId) => {
            await appointments.update(data.clinicId, appointmentId, { status: 'cancelled' })
            await appointments.addEvent(data.clinicId, appointmentId, 'cancelled')
          },
        })
        await reply(result.reply)
        nextFlow = result.done ? null : { action: 'cancel', state: result.nextState }
        break
      }

      case 'reschedule': {
        if (!calendar) {
          await reply(calendarUnavailable(language))
          await notificationQueue.add('notify', { ...data, reason: 'human_handoff' })
          break
        }
        const stored = loadStoredFlow(metadata, 'reschedule')
        const state = stored?.action === 'reschedule' ? stored.state : initialRescheduleState()
        const result = await advanceRescheduleFlow(state, data.message, {
          language,
          clinic: clinicInfo,
          appointment: upcoming[0] ? toUpcoming(upcoming[0], providers) : null,
        }, {
          calendar,
          applyReschedule: async ({ appointmentId, startTime, endTime }) => {
            await appointments.update(data.clinicId, appointmentId, { startTime, endTime, status: 'confirmed' })
            await appointments.addEvent(data.clinicId, appointmentId, 'rescheduled')
          },
        })
        await reply(result.reply)
        nextFlow = result.done ? null : { action: 'reschedule', state: result.nextState }
        break
      }

      case 'book': {
        const stored = loadStoredFlow(metadata, 'book')
        const state = stored?.action === 'book' ? stored.state : initialBookingState()

        // P18 (Gap #32): prefer the clinic's doctors as bookable resources. When a
        // doctor is chosen (state.providerId holds the doctor id), use THAT doctor's
        // own calendar, falling back to the clinic calendar.
        const doctors = await createDoctorsRepository(sql).listByClinic(data.clinicId)
        const doctorMode = doctors.length > 0

        let bookingCalendar: CalendarOps | null = calendar
        if (doctorMode && state.providerId) {
          const doctor = doctors.find((d) => d.id === state.providerId)
          const docCal = doctor ? getDoctorCalendarConfig(doctor) : null
          bookingCalendar = docCal && doctor
            ? createGoogleCalendarOps({
                ...docCal,
                timezone: clinic.timezone,
                onTokensRefreshed: persistDoctorTokens(sql, data.clinicId, doctor.id),
              })
            : calendar
        }

        // A calendar is required once we have a selection (or in legacy provider mode);
        // before a doctor is picked it isn't touched, so we can proceed without one.
        if (!bookingCalendar && (state.providerId || !doctorMode)) {
          await reply(calendarUnavailable(language))
          await notificationQueue.add('notify', { ...data, reason: 'human_handoff' })
          break
        }

        const resourceList: ProviderRef[] = doctorMode
          ? doctors.map((d) => ({
              id: d.id,
              fullName: d.name,
              specialty: d.specialty,
              // Req 30: the doctor's own working hours restrict the bookable slots.
              availability: normalizeAvailability(d.availableDays),
            }))
          : providers.map(toProviderRef)

        const result = await advanceBookingFlow(state, data.message, {
          language,
          clinic: clinicInfo,
          providers: resourceList,
          patientName: patient?.fullName ?? null,
        }, {
          calendar: bookingCalendar ?? unconfiguredCalendar,
          saveAppointment: async ({ providerId, doctorName, specialty, startTime, endTime, reason, preferredDate, preferredTime, googleEventId }) => {
            // Req 10: the full intake captured during the flow (reason, the
            // patient's preferred date/time, the chosen doctor + specialty and the
            // originating source channel) is persisted onto the appointment...
            const intake: BookingIntake = {
              reason,
              preferredDate,
              preferredTime,
              doctorId: providerId,
              doctorName,
              specialty,
              source: patientSource(patient),
            }
            const created = await appointments.create({
              clinicId: data.clinicId,
              patientId,
              ...(doctorMode ? { doctorId: providerId } : { providerId }),
              conversationId: data.conversationId,
              startTime,
              endTime,
              notes: reason,
              metadata: { intake },
            })
            await appointments.update(data.clinicId, created.id, { status: 'confirmed', googleEventId })
            await appointments.addEvent(data.clinicId, created.id, 'confirmed')
            // ...and merged onto the patient record so it is queryable from the
            // patient view, not only buried in the appointment. Best-effort: a
            // write failure is logged but never breaks the confirmation reply.
            if (patient) {
              try {
                await patients.update(data.clinicId, patient.id, {
                  metadata: mergePatientIntake(patient.metadata, intake),
                })
              } catch (e) {
                console.error(`[scheduling] failed to persist patient intake for ${patient.id}`, e)
              }
            }
            // Auto-tag the conversation as appointment_scheduled (Req 11). Idempotent.
            if (data.conversationId) {
              const tag = await conversations.createTag({
                clinicId: data.clinicId,
                name: 'appointment_scheduled',
                color: '#2563eb',
              })
              await conversations.addTag(data.clinicId, data.conversationId, tag.id)
            }

            // Follow-up automation (Rev1 #14): schedule the appointment-relative
            // follow-ups (confirmation, reminder, post-consultation, 7-day, 3-month)
            // as delayed jobs. Best-effort — a queue failure never breaks the booking.
            await scheduleAppointmentFollowUps({
              clinicId: data.clinicId,
              patientId,
              appointmentId: created.id,
              startTime,
              endTime,
            })
          },
        })
        await reply(result.reply)
        if (result.handoff) await notificationQueue.add('notify', { ...data, reason: 'human_handoff' })
        nextFlow = result.done ? null : { action: 'book', state: result.nextState }
        break
      }
      }
    } catch (err) {
      console.error(`[scheduling] calendar flow failed for clinic ${data.clinicId} (${data.action}):`, err)
      await createErrorReviewsRepository(sql)
        .create({
          clinicId: data.clinicId,
          errorType: 'calendar_failure',
          errorMessage: err instanceof Error ? err.message : String(err),
          context: {
            conversationId: data.conversationId ?? null,
            action: data.action,
            patientId: data.patientId ?? null,
          },
        })
        .catch((logErr) => console.error('[scheduling] failed to log calendar failure:', logErr))
      // Tell the patient a human will follow up and hand off; do not persist a
      // partially-advanced flow (we return without writing flow state).
      await reply(calendarUnavailable(language)).catch(() => {})
      await notificationQueue.add('notify', { ...data, reason: 'human_handoff' })
      return
    }

    // Persist (or clear) the flow state for the next inbound message.
    if (conversation) {
      const updated = { ...metadata }
      if (nextFlow) updated['scheduling'] = nextFlow
      else delete updated['scheduling']
      await conversations.update(data.clinicId, conversation.id, { metadata: updated })

      // Follow-up automation (Rev1 #14): the flow asked the patient something and is
      // now waiting on them. Schedule a single no_response nudge on the first such
      // turn; the follow-up worker self-cancels it if the patient replies in time.
      if (nextFlow && !hadStoredFlow) {
        await scheduleNoResponseFollowUp({
          clinicId: data.clinicId,
          patientId,
          conversationId: conversation.id,
          silentSinceIso: nowIso,
        })
      }
    }
  } finally {
    await sql.end()
  }
}

function calendarUnavailable(language: Language): string {
  return language === 'en'
    ? 'Our scheduling system is not available right now. A team member will contact you shortly.'
    : 'Nuestro sistema de agendamiento no está disponible en este momento. Un miembro del equipo le contactará en breve.'
}
