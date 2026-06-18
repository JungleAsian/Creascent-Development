import type { Sql } from '../client.js'
import { toJson } from '../client.js'
import type { ErrorReview } from '../types/index.js'

export interface CreateErrorReviewInput {
  clinicId?: string | null
  errorType: string
  errorMessage: string
  stackTrace?: string | null
  context?: Record<string, unknown>
}

export interface ErrorReviewsRepository {
  /** Record a runtime error (e.g. a bot LLM failure) for later operator review. */
  create(data: CreateErrorReviewInput): Promise<ErrorReview>
  listOpen(clinicId: string): Promise<ErrorReview[]>
  /** All error reviews for a clinic (newest first), optionally filtered by status. */
  listByClinic(clinicId: string, status?: ErrorReview['status']): Promise<ErrorReview[]>
  /** Mark an error reviewed+resolved by an operator. Returns the updated row or null. */
  resolve(clinicId: string, id: string, reviewedBy: string): Promise<ErrorReview | null>
}

export function createErrorReviewsRepository(sql: Sql): ErrorReviewsRepository {
  return {
    async create(data) {
      const rows = await sql<ErrorReview[]>`
        INSERT INTO error_reviews (clinic_id, error_type, error_message, stack_trace, context)
        VALUES (
          ${data.clinicId ?? null},
          ${data.errorType},
          ${data.errorMessage},
          ${data.stackTrace ?? null},
          ${sql.json(toJson(data.context ?? {}))}
        )
        RETURNING *
      `
      return rows[0]!
    },

    async listOpen(clinicId) {
      return sql<ErrorReview[]>`
        SELECT * FROM error_reviews
        WHERE clinic_id = ${clinicId} AND status = 'open'
        ORDER BY created_at DESC
      `
    },

    async listByClinic(clinicId, status) {
      if (status) {
        return sql<ErrorReview[]>`
          SELECT * FROM error_reviews
          WHERE clinic_id = ${clinicId} AND status = ${status}
          ORDER BY created_at DESC
        `
      }
      return sql<ErrorReview[]>`
        SELECT * FROM error_reviews
        WHERE clinic_id = ${clinicId}
        ORDER BY created_at DESC
      `
    },

    async resolve(clinicId, id, reviewedBy) {
      const rows = await sql<ErrorReview[]>`
        UPDATE error_reviews SET
          status      = 'resolved',
          reviewed_by = ${reviewedBy},
          resolved_at = NOW(),
          updated_at  = NOW()
        WHERE clinic_id = ${clinicId} AND id = ${id}
        RETURNING *
      `
      return rows[0] ?? null
    },
  }
}
