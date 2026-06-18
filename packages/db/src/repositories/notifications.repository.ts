import type { Sql } from '../client.js'
import { toJson } from '../client.js'
import type { NotificationEvent, NotificationStatus, NotificationType } from '../types/index.js'

export interface CreateNotificationInput {
  clinicId?: string | null
  /** Delivery channel. Defaults to 'email' (the only channel wired in P07). */
  notificationType?: NotificationType
  /** Secretary alert taxonomy value (emergency, booking_confirmed, …). */
  alertType: string
  priority?: string
  recipient: string
  subject?: string | null
  content: string
  conversationId?: string | null
  status?: NotificationStatus
  metadata?: Record<string, unknown>
}

export interface NotificationsRepository {
  /** Persist a notification (defaults to status 'pending'). */
  create(data: CreateNotificationInput): Promise<NotificationEvent>
  /** Most recent notifications for a clinic, newest first. */
  listByClinic(clinicId: string, limit?: number): Promise<NotificationEvent[]>
  /** Mark a notification acknowledged by a secretary. Returns null if not found. */
  acknowledge(id: string): Promise<NotificationEvent | null>
  /** Update delivery status (e.g. pending → sent / failed). */
  updateStatus(id: string, status: NotificationStatus, error?: string | null): Promise<void>
  /**
   * True if a notification of the given alert type already exists for this
   * conversation within the last `withinMinutes` minutes. Used by the timeout
   * monitor to avoid re-alerting on every tick.
   */
  existsRecent(
    clinicId: string,
    conversationId: string,
    alertType: string,
    withinMinutes: number,
  ): Promise<boolean>
}

export function createNotificationsRepository(sql: Sql): NotificationsRepository {
  return {
    async create(data) {
      const rows = await sql<NotificationEvent[]>`
        INSERT INTO notification_events
          (clinic_id, notification_type, alert_type, priority, recipient, subject, content, conversation_id, status, metadata)
        VALUES (
          ${data.clinicId ?? null},
          ${data.notificationType ?? 'email'},
          ${data.alertType},
          ${data.priority ?? null},
          ${data.recipient},
          ${data.subject ?? null},
          ${data.content},
          ${data.conversationId ?? null},
          ${data.status ?? 'pending'},
          ${sql.json(toJson(data.metadata ?? {}))}
        )
        RETURNING *
      `
      return rows[0]!
    },

    async listByClinic(clinicId, limit = 50) {
      return sql<NotificationEvent[]>`
        SELECT * FROM notification_events
        WHERE clinic_id = ${clinicId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    },

    async acknowledge(id) {
      const rows = await sql<NotificationEvent[]>`
        UPDATE notification_events
        SET status = 'acknowledged', acknowledged_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `
      return rows[0] ?? null
    },

    async updateStatus(id, status, error) {
      await sql`
        UPDATE notification_events
        SET status  = ${status},
            sent_at = CASE WHEN ${status} = 'sent' THEN NOW() ELSE sent_at END,
            error   = ${error ?? null}
        WHERE id = ${id}
      `
    },

    async existsRecent(clinicId, conversationId, alertType, withinMinutes) {
      const rows = await sql<[{ exists: boolean }]>`
        SELECT EXISTS (
          SELECT 1 FROM notification_events
          WHERE clinic_id       = ${clinicId}
            AND conversation_id = ${conversationId}
            AND alert_type      = ${alertType}
            AND created_at      > NOW() - ${`${withinMinutes} minutes`}::interval
        ) AS exists
      `
      return rows[0]?.exists ?? false
    },
  }
}
