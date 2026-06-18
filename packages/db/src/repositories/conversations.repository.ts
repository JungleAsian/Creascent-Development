import type { Sql } from '../client.js'
import { toJson } from '../client.js'
import type {
  Conversation,
  ConversationStatus,
  ConversationTag,
  InternalNote,
  Channel,
} from '../types/index.js'

export interface CreateConversationInput {
  clinicId: string
  patientId?: string
  channel: Channel
  channelContactHandle: string
  iaProfileId?: string
  metadata?: Record<string, unknown>
}

export interface UpdateConversationInput {
  status?: ConversationStatus
  assignedTo?: string | null
  iaProfileId?: string | null
  lastMessageAt?: string
  metadata?: Record<string, unknown>
}

export interface CreateTagInput {
  clinicId: string
  name: string
  color?: string
}

export interface CreateNoteInput {
  conversationId: string
  clinicId: string
  authorId: string
  content: string
}

export interface ConversationsRepository {
  findById(clinicId: string, id: string): Promise<Conversation | null>
  listByClinic(clinicId: string, status?: ConversationStatus): Promise<Conversation[]>
  countActive(clinicId: string): Promise<number>
  create(data: CreateConversationInput): Promise<Conversation>
  update(clinicId: string, id: string, data: UpdateConversationInput): Promise<Conversation>

  listTags(clinicId: string): Promise<ConversationTag[]>
  createTag(data: CreateTagInput): Promise<ConversationTag>
  addTag(clinicId: string, conversationId: string, tagId: string): Promise<void>
  removeTag(clinicId: string, conversationId: string, tagId: string): Promise<void>

  listNotes(clinicId: string, conversationId: string): Promise<InternalNote[]>
  addNote(data: CreateNoteInput): Promise<InternalNote>
}

export function createConversationsRepository(sql: Sql): ConversationsRepository {
  return {
    async findById(clinicId, id) {
      const rows = await sql<Conversation[]>`
        SELECT * FROM conversations WHERE clinic_id = ${clinicId} AND id = ${id} LIMIT 1
      `
      return rows[0] ?? null
    },

    async listByClinic(clinicId, status) {
      if (status) {
        return sql<Conversation[]>`
          SELECT * FROM conversations
          WHERE clinic_id = ${clinicId} AND status = ${status}
          ORDER BY last_message_at DESC NULLS LAST, created_at DESC
        `
      }
      return sql<Conversation[]>`
        SELECT * FROM conversations
        WHERE clinic_id = ${clinicId}
        ORDER BY last_message_at DESC NULLS LAST, created_at DESC
      `
    },

    async countActive(clinicId) {
      const rows = await sql<[{ count: string }]>`
        SELECT COUNT(*) FROM conversations WHERE clinic_id = ${clinicId} AND status IN ('open', 'assigned')
      `
      return parseInt(rows[0]?.count ?? '0', 10)
    },

    async create(data) {
      const rows = await sql<Conversation[]>`
        INSERT INTO conversations (clinic_id, patient_id, channel, channel_contact_handle, ia_profile_id, metadata)
        VALUES (
          ${data.clinicId},
          ${data.patientId ?? null},
          ${data.channel},
          ${data.channelContactHandle},
          ${data.iaProfileId ?? null},
          ${sql.json(toJson(data.metadata ?? {}))}
        )
        RETURNING *
      `
      return rows[0]!
    },

    async update(clinicId, id, data) {
      const rows = await sql<Conversation[]>`
        UPDATE conversations SET
          status          = COALESCE(${data.status          ?? null}, status),
          assigned_to     = CASE WHEN ${data.assignedTo    !== undefined} THEN ${data.assignedTo    ?? null} ELSE assigned_to     END,
          ia_profile_id   = CASE WHEN ${data.iaProfileId   !== undefined} THEN ${data.iaProfileId   ?? null} ELSE ia_profile_id   END,
          last_message_at = COALESCE(${data.lastMessageAt  ?? null}::timestamptz, last_message_at),
          metadata        = CASE WHEN ${data.metadata       !== undefined} THEN ${sql.json(toJson(data.metadata ?? {}))} ELSE metadata END
        WHERE clinic_id = ${clinicId} AND id = ${id}
        RETURNING *
      `
      if (!rows[0]) throw new Error(`Conversation not found: ${id}`)
      return rows[0]
    },

    async listTags(clinicId) {
      return sql<ConversationTag[]>`
        SELECT * FROM conversation_tags WHERE clinic_id = ${clinicId} ORDER BY name
      `
    },

    async createTag(data) {
      const rows = await sql<ConversationTag[]>`
        INSERT INTO conversation_tags (clinic_id, name, color)
        VALUES (${data.clinicId}, ${data.name}, ${data.color ?? '#6366f1'})
        ON CONFLICT (clinic_id, name) DO UPDATE SET color = EXCLUDED.color
        RETURNING *
      `
      return rows[0]!
    },

    async addTag(clinicId, conversationId, tagId) {
      await sql`
        INSERT INTO conversation_tag_links (conversation_id, tag_id)
        SELECT ${conversationId}, ${tagId}
        WHERE EXISTS (
          SELECT 1 FROM conversations c WHERE c.id = ${conversationId} AND c.clinic_id = ${clinicId}
        )
        ON CONFLICT DO NOTHING
      `
    },

    async removeTag(_clinicId, conversationId, tagId) {
      await sql`
        DELETE FROM conversation_tag_links
        WHERE conversation_id = ${conversationId} AND tag_id = ${tagId}
      `
    },

    async listNotes(clinicId, conversationId) {
      return sql<InternalNote[]>`
        SELECT * FROM internal_notes
        WHERE clinic_id = ${clinicId} AND conversation_id = ${conversationId}
        ORDER BY created_at
      `
    },

    async addNote(data) {
      const rows = await sql<InternalNote[]>`
        INSERT INTO internal_notes (conversation_id, clinic_id, author_id, content)
        VALUES (${data.conversationId}, ${data.clinicId}, ${data.authorId}, ${data.content})
        RETURNING *
      `
      return rows[0]!
    },
  }
}
