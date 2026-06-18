import type { Sql } from '../client.js'
import type {
  MessageTemplate,
  MessageTemplateCategory,
  MessageTemplateStatus,
} from '../types/index.js'

export interface CreateMessageTemplateInput {
  clinicId: string
  name: string
  category: MessageTemplateCategory
  language?: string
  body: string
  status?: MessageTemplateStatus
}

export interface MessageTemplatesRepository {
  listByClinic(clinicId: string): Promise<MessageTemplate[]>
  create(data: CreateMessageTemplateInput): Promise<MessageTemplate>
  setStatus(clinicId: string, id: string, status: MessageTemplateStatus): Promise<MessageTemplate | null>
}

export function createMessageTemplatesRepository(sql: Sql): MessageTemplatesRepository {
  return {
    async listByClinic(clinicId) {
      return sql<MessageTemplate[]>`
        SELECT * FROM message_templates
        WHERE clinic_id = ${clinicId}
        ORDER BY created_at DESC
      `
    },

    async create(data) {
      // A clinic submits one template per name; resubmitting resets it to pending.
      const rows = await sql<MessageTemplate[]>`
        INSERT INTO message_templates (clinic_id, name, category, language, body, status)
        VALUES (
          ${data.clinicId},
          ${data.name},
          ${data.category},
          ${data.language ?? 'es'},
          ${data.body},
          ${data.status ?? 'pending'}
        )
        ON CONFLICT (clinic_id, name) DO UPDATE
          SET category   = EXCLUDED.category,
              language   = EXCLUDED.language,
              body       = EXCLUDED.body,
              status     = EXCLUDED.status,
              updated_at = NOW()
        RETURNING *
      `
      return rows[0]!
    },

    async setStatus(clinicId, id, status) {
      const rows = await sql<MessageTemplate[]>`
        UPDATE message_templates
        SET status = ${status}, updated_at = NOW()
        WHERE clinic_id = ${clinicId} AND id = ${id}
        RETURNING *
      `
      return rows[0] ?? null
    },
  }
}
