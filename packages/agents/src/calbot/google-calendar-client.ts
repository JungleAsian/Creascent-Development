// Only file permitted to import googleapis (enforced by the no-direct-googleapis
// convention). Everything else in the codebase talks to Google Calendar through
// the CalendarOps interface so the flows stay pure and testable.
import type { Auth } from 'googleapis'
import type { CalendarClient, AppointmentData } from '../index.js'

// googleapis is a heavy module; import it lazily so merely loading the agents
// barrel (router, botbase, calbot flows) stays fast. Only the calendar I/O paths
// pay the load cost, and only once.
type GoogleApi = (typeof import('googleapis'))['google']
let googlePromise: Promise<GoogleApi> | null = null
function loadGoogle(): Promise<GoogleApi> {
  if (!googlePromise) googlePromise = import('googleapis').then((m) => m.google)
  return googlePromise
}

const SLOT_MINUTES = 30
const DAY_START_HOUR = 9 // 09:00
const DAY_END_HOUR = 18 // 18:00

export interface TimeSlot {
  start: string // `YYYY-MM-DDTHH:MM:SS` (clinic-local, naive)
  end: string
}

export interface CreateEventParams {
  accessToken: string
  refreshToken: string
  calendarId: string
  title: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
  durationMinutes: number
  timezone: string
  description?: string
}

/**
 * Build an OAuth2 client for a clinic's Google Calendar connection. The clinicId
 * is accepted for symmetry / future per-clinic credentials, but the OAuth app
 * itself is shared (one Google Cloud project for the SaaS).
 */
export async function getOAuth2Client(_clinicId: string): Promise<Auth.OAuth2Client> {
  const google = await loadGoogle()
  return new google.auth.OAuth2(
    process.env['GOOGLE_CLIENT_ID'],
    process.env['GOOGLE_CLIENT_SECRET'],
    process.env['GOOGLE_REDIRECT_URI'],
  )
}

async function authedCalendar(accessToken: string, refreshToken: string) {
  const google = await loadGoogle()
  const auth = await getOAuth2Client('')
  auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken })
  return google.calendar({ version: 'v3', auth })
}

/** Free 30-min slots between 09:00–18:00 on `date`, minus anything already booked. */
export async function listAvailableSlots(
  accessToken: string,
  refreshToken: string,
  calendarId: string,
  date: string,
  timezone: string,
): Promise<TimeSlot[]> {
  const calendar = await authedCalendar(accessToken, refreshToken)
  const dayStart = new Date(`${date}T00:00:00`)
  const dayEnd = new Date(`${date}T23:59:59`)

  const { data } = await calendar.events.list({
    calendarId,
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  })

  return computeFreeSlots(data.items ?? [], date, timezone)
}

/** Create a calendar event; returns the Google event id. */
export async function createCalendarEvent(params: CreateEventParams): Promise<string> {
  const calendar = await authedCalendar(params.accessToken, params.refreshToken)
  const start = new Date(`${params.date}T${params.time}:00`)
  const end = new Date(start.getTime() + params.durationMinutes * 60_000)

  const { data } = await calendar.events.insert({
    calendarId: params.calendarId,
    requestBody: {
      summary: params.title,
      description: params.description,
      start: { dateTime: start.toISOString(), timeZone: params.timezone },
      end: { dateTime: end.toISOString(), timeZone: params.timezone },
    },
  })

  if (!data.id) throw new Error('Google Calendar did not return an event id')
  return data.id
}

/** Move an existing event to a new date/time (reschedule). */
export async function updateCalendarEvent(params: CreateEventParams & { eventId: string }): Promise<void> {
  const calendar = await authedCalendar(params.accessToken, params.refreshToken)
  const start = new Date(`${params.date}T${params.time}:00`)
  const end = new Date(start.getTime() + params.durationMinutes * 60_000)

  await calendar.events.patch({
    calendarId: params.calendarId,
    eventId: params.eventId,
    requestBody: {
      start: { dateTime: start.toISOString(), timeZone: params.timezone },
      end: { dateTime: end.toISOString(), timeZone: params.timezone },
    },
  })
}

export async function deleteCalendarEvent(
  accessToken: string,
  refreshToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const calendar = await authedCalendar(accessToken, refreshToken)
  await calendar.events.delete({ calendarId, eventId })
}

interface RawEvent {
  start?: { dateTime?: string | null } | null
  end?: { dateTime?: string | null } | null
}

/**
 * Generate 30-min slots from 09:00 to 18:00 on `date` and drop any that overlap an
 * existing event. Pure: exported so the slot maths can be unit-tested without Google.
 */
export function computeFreeSlots(events: RawEvent[], date: string, _timezone: string): TimeSlot[] {
  const slots: TimeSlot[] = []
  const pad = (n: number) => String(n).padStart(2, '0')

  for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
    for (const m of [0, SLOT_MINUTES]) {
      const startMin = h * 60 + m
      const endMin = startMin + SLOT_MINUTES
      const start = `${date}T${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}:00`
      const end = `${date}T${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}:00`

      const conflict = events.some((ev) => {
        const evStart = ev.start?.dateTime
        const evEnd = ev.end?.dateTime
        if (!evStart || !evEnd) return false
        return new Date(evStart) < new Date(end) && new Date(evEnd) > new Date(start)
      })

      if (!conflict) slots.push({ start, end })
    }
  }
  return slots
}

/**
 * CalendarOps is the narrow surface the booking/reschedule/cancel flows depend on.
 * The worker binds the real Google implementation; tests bind an in-memory stub.
 */
export interface CalendarOps {
  listSlots(date: string): Promise<TimeSlot[]>
  createEvent(params: { title: string; date: string; time: string; durationMinutes: number; description?: string }): Promise<string>
  updateEvent(params: { eventId: string; title: string; date: string; time: string; durationMinutes: number }): Promise<void>
  deleteEvent(eventId: string): Promise<void>
}

export interface GoogleCalendarConfig {
  accessToken: string
  refreshToken: string
  calendarId: string
  timezone: string
}

/** Bind {@link CalendarOps} to a clinic's Google credentials. */
export function createGoogleCalendarOps(config: GoogleCalendarConfig): CalendarOps {
  return {
    listSlots: (date) =>
      listAvailableSlots(config.accessToken, config.refreshToken, config.calendarId, date, config.timezone),
    createEvent: (p) => createCalendarEvent({ ...config, ...p }),
    updateEvent: (p) => updateCalendarEvent({ ...config, ...p }),
    deleteEvent: (eventId) =>
      deleteCalendarEvent(config.accessToken, config.refreshToken, config.calendarId, eventId),
  }
}

/**
 * Adapter to the legacy CalendarClient interface (kept for back-compat with the
 * P03 agents barrel). New code should prefer {@link createGoogleCalendarOps}.
 */
export function createGoogleCalendarClient(config: GoogleCalendarConfig): CalendarClient {
  const ops = createGoogleCalendarOps(config)
  return {
    async listSlots(_doctorId, date) {
      return (await ops.listSlots(date)).map((s) => s.start)
    },
    async bookAppointment(data: AppointmentData) {
      return ops.createEvent({
        title: data.patientName ? `Cita: ${data.patientName}` : 'Cita',
        date: data.date,
        time: data.time,
        durationMinutes: SLOT_MINUTES,
      })
    },
    async cancelAppointment(appointmentId) {
      await ops.deleteEvent(appointmentId)
    },
    async rescheduleAppointment(appointmentId, newData) {
      await ops.updateEvent({
        eventId: appointmentId,
        title: newData.patientName ? `Cita: ${newData.patientName}` : 'Cita',
        date: newData.date,
        time: newData.time,
        durationMinutes: SLOT_MINUTES,
      })
      return appointmentId
    },
  }
}
