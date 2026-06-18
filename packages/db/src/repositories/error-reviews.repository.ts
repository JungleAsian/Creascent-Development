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
  }
}
