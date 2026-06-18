import type { Sql } from '../client.js'
import type { QuickReplyTemplate } from '../types/index.js'

export interface CreateQuickReplyTemplateInput {
  clinicId: string
  title: string
  content: string
}

export interface QuickReplyTemplatesRepository {
  listByClinic(clinicId: string): Promise<QuickReplyTemplate[]>
  create(data: CreateQuickReplyTemplateInput): Promise<QuickReplyTemplate>
  delete(clinicId: string, id: string): Promise<boolean>
}

export function createQuickReplyTemplatesRepository(sql: Sql): QuickReplyTemplatesRepository {
  return {
    async listByClinic(clinicId) {
      return sql<QuickReplyTemplate[]>`
        SELECT * FROM quick_reply_templates
        WHERE clinic_id = ${clinicId}
        ORDER BY created_at DESC
      `
    },

    async create(data) {
      const rows = await sql<QuickReplyTemplate[]>`
        INSERT INTO quick_reply_templates (clinic_id, title, content)
        VALUES (${data.clinicId}, ${data.title}, ${data.content})
        RETURNING *
      `
      return rows[0]!
    },

    async delete(clinicId, id) {
      const rows = await sql<{ id: string }[]>`
        DELETE FROM quick_reply_templates
        WHERE clinic_id = ${clinicId} AND id = ${id}
        RETURNING id
      `
      return rows.length > 0
    },
  }
}
