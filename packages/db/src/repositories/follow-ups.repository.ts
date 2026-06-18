// P18 (Gap #37): Follow-up tracking — records automated review requests so we
// never double-send and can measure click-through.
import type { Sql } from '../client.js'
import { toJson } from '../client.js'
import type { FollowUp, FollowUpStatus } from '../types/index.js'

export interface CreateFollowUpInput {
  clinicId: string
  patientId: string
  appointmentId?: string
  type: string
  status?: FollowUpStatus
  metadata?: Record<string, unknown>
}

export interface FollowUpsRepository {
  listByClinic(clinicId: string): Promise<FollowUp[]>
  findByAppointment(clinicId: string, appointmentId: string, type: string): Promise<FollowUp | null>
  /** Insert a follow-up, ignoring the (appointment, type) duplicate. Returns null if it already existed. */
  createIfAbsent(data: CreateFollowUpInput): Promise<FollowUp | null>
  markSent(clinicId: string, id: string): Promise<void>
  /** Stamp the click and flip status → 'clicked'. Returns the row (or null if unknown). */
  markClicked(id: string): Promise<FollowUp | null>
}

export function createFollowUpsRepository(sql: Sql): FollowUpsRepository {
  return {
    async listByClinic(clinicId) {
      return sql<FollowUp[]>`
        SELECT * FROM follow_ups WHERE clinic_id = ${clinicId} ORDER BY created_at DESC
      `
    },

    async findByAppointment(clinicId, appointmentId, type) {
      const rows = await sql<FollowUp[]>`
        SELECT * FROM follow_ups
        WHERE clinic_id = ${clinicId} AND appointment_id = ${appointmentId} AND type = ${type}
        LIMIT 1
      `
      return rows[0] ?? null
    },

    async createIfAbsent(data) {
      const rows = await sql<FollowUp[]>`
        INSERT INTO follow_ups (clinic_id, patient_id, appointment_id, type, status, metadata)
        VALUES (
          ${data.clinicId},
          ${data.patientId},
          ${data.appointmentId ?? null},
          ${data.type},
          ${data.status ?? 'pending'},
          ${sql.json(toJson(data.metadata ?? {}))}
        )
        ON CONFLICT (appointment_id, type) WHERE appointment_id IS NOT NULL DO NOTHING
        RETURNING *
      `
      return rows[0] ?? null
    },

    async markSent(clinicId, id) {
      await sql`
        UPDATE follow_ups SET status = 'sent', review_sent_at = NOW()
        WHERE clinic_id = ${clinicId} AND id = ${id}
      `
    },

    async markClicked(id) {
      const rows = await sql<FollowUp[]>`
        UPDATE follow_ups
        SET status = 'clicked', review_clicked_at = COALESCE(review_clicked_at, NOW())
        WHERE id = ${id}
        RETURNING *
      `
      return rows[0] ?? null
    },
  }
}
