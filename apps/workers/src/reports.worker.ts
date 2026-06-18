// Consumes: reports queue (Gap #36 — automatic reports).
//
// An hourly tick fans out to every active clinic. Each clinic gets a DAILY report
// at its local 08:00 and a WEEKLY report on Monday at its local 09:00 — the local
// time gate is what makes the once-per-hour tick fire each report exactly once per
// clinic, without per-clinic cron rows. Reports are emailed (Resend) to the
// clinic's primary admin.
import {
  createServiceDbClient,
  createClinicsRepository,
  createUsersRepository,
  createMetricsRepository,
  createAppointmentsRepository,
  type Clinic,
} from '@docmee/db'
import { sendEmail } from '@docmee/notifications'
import { type Job } from '@docmee/queue'

const DAILY_HOUR = 8
const WEEKLY_HOUR = 9
const MONDAY = 1

interface LocalTime {
  hour: number
  /** 0=Sunday … 6=Saturday */
  dayOfWeek: number
}

/** Clinic-local hour + weekday for `now`, using the clinic's IANA timezone. */
export function localTimeIn(timezone: string, now: Date): LocalTime {
  const tz = timezone || 'UTC'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now)
  const hourRaw = parts.find((p) => p.type === 'hour')?.value ?? '0'
  const hour = Number(hourRaw) % 24
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { hour, dayOfWeek: dowMap[weekday] ?? 0 }
}

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`
const seconds = (s: number) => (s <= 0 ? '—' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`)

function dailyReportHtml(clinic: Clinic, data: DailyData): string {
  return `
    <h2>${clinic.name} — Daily report</h2>
    <p>Activity in the last 24 hours:</p>
    <ul>
      <li>Conversations: <b>${data.conversations}</b></li>
      <li>Messages: <b>${data.messages}</b></li>
      <li>Bot reply rate: <b>${pct(data.botReplyRate)}</b></li>
      <li>Appointments booked: <b>${data.bookings}</b></li>
      <li>Avg. response time: <b>${seconds(data.avgResponseSeconds)}</b></li>
    </ul>
  `
}

function weeklyReportHtml(clinic: Clinic, data: WeeklyData): string {
  const arrow = (cur: number, prev: number) => (cur >= prev ? '▲' : '▼')
  return `
    <h2>${clinic.name} — Weekly report</h2>
    <p>This week vs. the previous week:</p>
    <ul>
      <li>Conversations: <b>${data.conversationsThisWeek}</b> ${arrow(data.conversationsThisWeek, data.conversationsLastWeek)} (was ${data.conversationsLastWeek})</li>
      <li>Appointments booked: <b>${data.bookingsThisWeek}</b> ${arrow(data.bookingsThisWeek, data.bookingsLastWeek)} (was ${data.bookingsLastWeek})</li>
      <li>Bot reply rate: <b>${pct(data.botReplyRate)}</b></li>
    </ul>
  `
}

interface DailyData {
  conversations: number
  messages: number
  botReplyRate: number
  bookings: number
  avgResponseSeconds: number
}
interface WeeklyData {
  conversationsThisWeek: number
  conversationsLastWeek: number
  bookingsThisWeek: number
  bookingsLastWeek: number
  botReplyRate: number
}

export async function processReportsJob(_job: Job): Promise<void> {
  const sql = createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })
  const now = new Date()

  try {
    const clinics = createClinicsRepository(sql)
    const users = createUsersRepository(sql)
    const metrics = createMetricsRepository(sql)
    const appointments = createAppointmentsRepository(sql)

    for (const clinic of await clinics.list()) {
      if (clinic.status !== 'active') continue
      const local = localTimeIn(clinic.timezone, now)
      const wantDaily = local.hour === DAILY_HOUR
      const wantWeekly = local.dayOfWeek === MONDAY && local.hour === WEEKLY_HOUR
      if (!wantDaily && !wantWeekly) continue

      const recipient = await users.findPrimaryEmail(clinic.id)
      if (!recipient) continue

      const dashboard = await metrics.dashboard(clinic.id, clinic.timezone)

      if (wantDaily) {
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const bookings = await appointments.countCreatedBetween(clinic.id, dayAgo.toISOString(), now.toISOString())
        await sendEmail({
          to: recipient,
          subject: `${clinic.name}: daily report`,
          html: dailyReportHtml(clinic, {
            conversations: dashboard.conversationsToday,
            messages: dashboard.messagesToday,
            botReplyRate: dashboard.botReplyRate,
            bookings,
            avgResponseSeconds: dashboard.avgResponseSeconds,
          }),
        })
      }

      if (wantWeekly) {
        const perDay = dashboard.conversationsPerDay
        const last7 = perDay.slice(-7).reduce((s, d) => s + d.count, 0)
        const prev7 = perDay.slice(-14, -7).reduce((s, d) => s + d.count, 0)
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
        const bookingsThisWeek = await appointments.countCreatedBetween(clinic.id, weekAgo.toISOString(), now.toISOString())
        const bookingsLastWeek = await appointments.countCreatedBetween(clinic.id, twoWeeksAgo.toISOString(), weekAgo.toISOString())
        await sendEmail({
          to: recipient,
          subject: `${clinic.name}: weekly report`,
          html: weeklyReportHtml(clinic, {
            conversationsThisWeek: last7,
            conversationsLastWeek: prev7,
            bookingsThisWeek,
            bookingsLastWeek,
            botReplyRate: dashboard.botReplyRate,
          }),
        })
      }
    }
  } finally {
    await sql.end()
  }
}
