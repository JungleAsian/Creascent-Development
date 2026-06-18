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
  /** Classified-intent distribution across the last 30 days, highest first. */
  topIntents: Array<{ intent: string; count: number }>
}

const num = (value: string | number | null | undefined): number => {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export interface MetricsRepository {
  dashboard(clinicId: string, timezone: string): Promise<MetricsDashboard>
}

export function createMetricsRepository(sql: Sql): MetricsRepository {
  return {
    async dashboard(clinicId, timezone) {
      const tz = timezone || 'UTC'

      const [convToday, msgToday, replyRate, response, perDay, intents] = await Promise.all([
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
            WHERE clinic_id = ${clinicId} AND created_at >= NOW() - INTERVAL '30 days'
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
          WHERE clinic_id = ${clinicId} AND created_at >= NOW() - INTERVAL '30 days'
          GROUP BY 1
          ORDER BY 1 ASC
        `,
        sql<{ intent: string; count: string }[]>`
          SELECT metadata->>'lastIntent' AS intent, COUNT(*) AS count
          FROM conversations
          WHERE clinic_id = ${clinicId}
            AND created_at >= NOW() - INTERVAL '30 days'
            AND metadata->>'lastIntent' IS NOT NULL
          GROUP BY 1
          ORDER BY count DESC
          LIMIT 8
        `,
      ])

      const inbound = num(replyRate[0]?.inbound)
      const replies = num(replyRate[0]?.replies)

      return {
        conversationsToday: num(convToday[0]?.count),
        messagesToday: num(msgToday[0]?.count),
        botReplyRate: inbound > 0 ? Math.min(1, replies / inbound) : 0,
        avgResponseSeconds: Math.round(num(response[0]?.avgSeconds)),
        conversationsPerDay: perDay.map((r) => ({ date: r.date, count: num(r.count) })),
        topIntents: intents.map((r) => ({ intent: r.intent, count: num(r.count) })),
      }
    },
  }
}
