import type { Sql } from '../client.js'

/** Aggregated activity metrics for one clinic (powers the P16 metrics dashboard). */
export interface MetricsDashboard {
  conversationsToday: number
  messagesToday: number
  /** Fraction (0..1) of today's inbound patient messages the bot answered. */
  botReplyRate: number
  /** Mean seconds between a patient message and the next clinic reply (last 30 days). */
  avgResponseSeconds: number
  /** Conversations opened per local day for the last 30 days (ascending). */
  conversationsPerDay: Array<{ date: string; count: number }>
  /** Classified-intent distribution (common questions) across the last 30 days, highest first. */
  topIntents: Array<{ intent: string; count: number }>
  // --- Req 17: full basic-metrics list (all over the trailing 30 days) ---
  /** Total conversations opened in the last 30 days (denominator for the rates below). */
  totalConversations: number
  /** Conversations opened per channel in the last 30 days, highest first. */
  conversationsByChannel: Array<{ channel: string; count: number }>
  /** Distinct patients (leads) who started a conversation in the last 30 days. */
  leads: number
  /** Conversations in the last 30 days that produced a confirmed/completed appointment. */
  bookings: number
  /** Fraction (0..1) of conversations that booked an appointment (booking conversion / conversion rate). */
  bookingConversionRate: number
  /** Fraction (0..1) of conversations transferred to a human (handoff or assigned). */
  transferRate: number
  /** Fraction (0..1) of conversations with an inbound patient message but no clinic reply. */
  noResponseRate: number
  /** Message volume by weekday (0=Sun) × hour (0–23), clinic-local — the peak-hours grid. */
  peakHours: Array<{ dayOfWeek: number; hour: number; count: number }>
}

const num = (value: string | number | null | undefined): number => {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export interface MetricsRepository {
  /**
   * @param windowDays Trailing window (in clinic-local days) for every "last N days"
   *   aggregate below — the dashboard's period filter (Req 17). Defaults to 30; the
   *   "today" cards always reflect the current local day regardless of the window.
   */
  dashboard(clinicId: string, timezone: string, windowDays?: number): Promise<MetricsDashboard>
}

export function createMetricsRepository(sql: Sql): MetricsRepository {
  return {
    async dashboard(clinicId, timezone, windowDays = 30) {
      const tz = timezone || 'UTC'
      // Defence in depth: the API whitelists the window, but clamp here too so a
      // direct caller can never inject a non-finite or unbounded interval.
      const days = Math.min(365, Math.max(1, Math.round(Number(windowDays) || 30)))

      const [
        convToday,
        msgToday,
        replyRate,
        response,
        perDay,
        intents,
        conv30,
        byChannel,
        bookings,
        noResp,
        peak,
      ] = await Promise.all([
        sql<[{ count: string }]>`
          SELECT COUNT(*) AS count FROM conversations
          WHERE clinic_id = ${clinicId}
            AND created_at >= date_trunc('day', NOW() AT TIME ZONE ${tz}) AT TIME ZONE ${tz}
        `,
        sql<[{ count: string }]>`
          SELECT COUNT(*) AS count FROM conversation_messages
          WHERE clinic_id = ${clinicId}
            AND created_at >= date_trunc('day', NOW() AT TIME ZONE ${tz}) AT TIME ZONE ${tz}
        `,
        sql<[{ inbound: string; replies: string }]>`
          SELECT
            COUNT(*) FILTER (WHERE role = 'user')                    AS inbound,
            COUNT(*) FILTER (WHERE role IN ('assistant', 'agent'))   AS replies
          FROM conversation_messages
          WHERE clinic_id = ${clinicId}
            AND created_at >= date_trunc('day', NOW() AT TIME ZONE ${tz}) AT TIME ZONE ${tz}
        `,
        sql<[{ avgSeconds: string | null }]>`
          WITH ordered AS (
            SELECT
              role,
              created_at,
              LEAD(created_at) OVER (PARTITION BY conversation_id ORDER BY created_at) AS next_at,
              LEAD(role)       OVER (PARTITION BY conversation_id ORDER BY created_at) AS next_role
            FROM conversation_messages
            WHERE clinic_id = ${clinicId} AND created_at >= NOW() - make_interval(days => ${days}::int)
          )
          SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (next_at - created_at))), 0) AS avg_seconds
          FROM ordered
          WHERE role = 'user'
            AND next_role IN ('assistant', 'agent')
            AND next_at IS NOT NULL
            AND next_at - created_at < INTERVAL '1 day'
        `,
        sql<{ date: string; count: string }[]>`
          SELECT
            to_char(date_trunc('day', created_at AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS date,
            COUNT(*) AS count
          FROM conversations
          WHERE clinic_id = ${clinicId} AND created_at >= NOW() - make_interval(days => ${days}::int)
          GROUP BY 1
          ORDER BY 1 ASC
        `,
        sql<{ intent: string; count: string }[]>`
          SELECT metadata->>'lastIntent' AS intent, COUNT(*) AS count
          FROM conversations
          WHERE clinic_id = ${clinicId}
            AND created_at >= NOW() - make_interval(days => ${days}::int)
            AND metadata->>'lastIntent' IS NOT NULL
          GROUP BY 1
          ORDER BY count DESC
          LIMIT 8
        `,
        sql<[{ total: string; transferred: string; leads: string }]>`
          SELECT
            COUNT(*)                                                              AS total,
            COUNT(*) FILTER (WHERE status = 'handoff' OR assigned_to IS NOT NULL)  AS transferred,
            COUNT(DISTINCT patient_id) FILTER (WHERE patient_id IS NOT NULL)        AS leads
          FROM conversations
          WHERE clinic_id = ${clinicId} AND created_at >= NOW() - make_interval(days => ${days}::int)
        `,
        sql<{ channel: string; count: string }[]>`
          SELECT channel, COUNT(*) AS count
          FROM conversations
          WHERE clinic_id = ${clinicId} AND created_at >= NOW() - make_interval(days => ${days}::int)
          GROUP BY channel
          ORDER BY count DESC
        `,
        sql<[{ count: string }]>`
          SELECT COUNT(DISTINCT c.id) AS count
          FROM conversations c
          JOIN appointments a ON a.conversation_id = c.id AND a.clinic_id = c.clinic_id
          WHERE c.clinic_id = ${clinicId}
            AND c.created_at >= NOW() - make_interval(days => ${days}::int)
            AND a.status IN ('confirmed', 'completed')
        `,
        sql<[{ withInbound: string; noResponse: string }]>`
          WITH per_conversation AS (
            SELECT
              conversation_id,
              COUNT(*) FILTER (WHERE role = 'user')                  AS inbound,
              COUNT(*) FILTER (WHERE role IN ('assistant', 'agent')) AS replies
            FROM conversation_messages
            WHERE clinic_id = ${clinicId} AND created_at >= NOW() - make_interval(days => ${days}::int)
            GROUP BY conversation_id
          )
          SELECT
            COUNT(*) FILTER (WHERE inbound > 0)                  AS with_inbound,
            COUNT(*) FILTER (WHERE inbound > 0 AND replies = 0)  AS no_response
          FROM per_conversation
        `,
        sql<{ dow: string; hour: string; count: string }[]>`
          SELECT
            EXTRACT(DOW  FROM created_at AT TIME ZONE ${tz})::int AS dow,
            EXTRACT(HOUR FROM created_at AT TIME ZONE ${tz})::int AS hour,
            COUNT(*) AS count
          FROM conversation_messages
          WHERE clinic_id = ${clinicId} AND created_at >= NOW() - make_interval(days => ${days}::int)
          GROUP BY 1, 2
          ORDER BY 1, 2
        `,
      ])

      const inbound = num(replyRate[0]?.inbound)
      const replies = num(replyRate[0]?.replies)

      const total = num(conv30[0]?.total)
      const bookingCount = num(bookings[0]?.count)
      const transferred = num(conv30[0]?.transferred)
      const withInbound = num(noResp[0]?.withInbound)
      const noResponse = num(noResp[0]?.noResponse)

      return {
        conversationsToday: num(convToday[0]?.count),
        messagesToday: num(msgToday[0]?.count),
        botReplyRate: inbound > 0 ? Math.min(1, replies / inbound) : 0,
        avgResponseSeconds: Math.round(num(response[0]?.avgSeconds)),
        conversationsPerDay: perDay.map((r) => ({ date: r.date, count: num(r.count) })),
        topIntents: intents.map((r) => ({ intent: r.intent, count: num(r.count) })),
        totalConversations: total,
        conversationsByChannel: byChannel.map((r) => ({ channel: r.channel, count: num(r.count) })),
        leads: num(conv30[0]?.leads),
        bookings: bookingCount,
        bookingConversionRate: total > 0 ? bookingCount / total : 0,
        transferRate: total > 0 ? transferred / total : 0,
        noResponseRate: withInbound > 0 ? noResponse / withInbound : 0,
        peakHours: peak.map((r) => ({ dayOfWeek: num(r.dow), hour: num(r.hour), count: num(r.count) })),
      }
    },
  }
}
