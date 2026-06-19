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
  /**
   * The most recent still-active (not resolved/archived) conversation for a contact on a
   * channel, or null. Lets ingest workers thread a new inbound message onto the
   * patient's open thread instead of opening a duplicate.
   */
  findOpenByContact(clinicId: string, channel: Channel, contactHandle: string): Promise<Conversation | null>
  listByClinic(clinicId: string, status?: ConversationStatus): Promise<Conversation[]>
  /** Every conversation for one patient, newest first (patient history view). */
  listByPatient(clinicId: string, patientId: string): Promise<Conversation[]>
  countActive(clinicId: string): Promise<number>
  /**
   * Conversations (across all clinics) in any of the given statuses whose last
   * inbound/outbound message is older than `olderThanMinutes`. Powers the
   * timeout monitor — service-client only (no clinic scoping).
   */
  listStale(statuses: ConversationStatus[], olderThanMinutes: number): Promise<Conversation[]>
  create(data: CreateConversationInput): Promise<Conversation>
  update(clinicId: string, id: string, data: UpdateConversationInput): Promise<Conversation>

  listTags(clinicId: string): Promise<ConversationTag[]>
  /** Tags currently linked to one conversation. */
  listTagsForConversation(clinicId: string, conversationId: string): Promise<ConversationTag[]>
  /** Resolve a clinic tag by its name (case-sensitive), or null. */
  findTagByName(clinicId: string, name: string): Promise<ConversationTag | null>
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

    async findOpenByContact(clinicId, channel, contactHandle) {
      const rows = await sql<Conversation[]>`
        SELECT * FROM conversations
        WHERE clinic_id = ${clinicId}
          AND channel = ${channel}
          AND channel_contact_handle = ${contactHandle}
          AND status NOT IN ('resolved', 'archived')
        ORDER BY last_message_at DESC NULLS LAST, created_at DESC
        LIMIT 1
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

    async listByPatient(clinicId, patientId) {
      return sql<Conversation[]>`
        SELECT * FROM conversations
        WHERE clinic_id = ${clinicId} AND patient_id = ${patientId}
        ORDER BY last_message_at DESC NULLS LAST, created_at DESC
      `
    },

    async countActive(clinicId) {
      const rows = await sql<[{ count: string }]>`
        SELECT COUNT(*) FROM conversations WHERE clinic_id = ${clinicId} AND status IN ('open', 'assigned')
      `
      return parseInt(rows[0]?.count ?? '0', 10)
    },

    async listStale(statuses, olderThanMinutes) {
      if (statuses.length === 0) return []
      return sql<Conversation[]>`
        SELECT * FROM conversations
        WHERE status = ANY(${statuses})
          AND COALESCE(last_message_at, created_at) < NOW() - ${`${olderThanMinutes} minutes`}::interval
        ORDER BY clinic_id, last_message_at NULLS LAST
      `
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

    async listTagsForConversation(clinicId, conversationId) {
      return sql<ConversationTag[]>`
        SELECT t.* FROM conversation_tags t
        JOIN conversation_tag_links l ON l.tag_id = t.id
        WHERE t.clinic_id = ${clinicId} AND l.conversation_id = ${conversationId}
        ORDER BY t.name
      `
    },

    async findTagByName(clinicId, name) {
      const rows = await sql<ConversationTag[]>`
        SELECT * FROM conversation_tags WHERE clinic_id = ${clinicId} AND name = ${name} LIMIT 1
      `
      return rows[0] ?? null
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
