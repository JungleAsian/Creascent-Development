import type { Sql } from '../client.js'
import { toJson } from '../client.js'
import type { ConversationMessage, MessageRole, ContentType } from '../types/index.js'

export interface CreateMessageInput {
  conversationId: string
  clinicId: string
  role: MessageRole
  content: string
  contentType?: ContentType
  channelMessageId?: string
  audioUrl?: string
  transcription?: string
  tokenCount?: number
  metadata?: Record<string, unknown>
}

export interface MessagesRepository {
  findById(clinicId: string, id: string): Promise<ConversationMessage | null>
  listByConversation(clinicId: string, conversationId: string): Promise<ConversationMessage[]>
  listByConversationSince(clinicId: string, conversationId: string, since: string): Promise<ConversationMessage[]>
  create(data: CreateMessageInput): Promise<ConversationMessage>
  markDelivered(clinicId: string, id: string, channelMessageId: string): Promise<void>
}

export function createMessagesRepository(sql: Sql): MessagesRepository {
  return {
    async findById(clinicId, id) {
      const rows = await sql<ConversationMessage[]>`
        SELECT * FROM conversation_messages WHERE clinic_id = ${clinicId} AND id = ${id} LIMIT 1
      `
      return rows[0] ?? null
    },

    async listByConversation(clinicId, conversationId) {
      return sql<ConversationMessage[]>`
        SELECT * FROM conversation_messages
        WHERE clinic_id = ${clinicId} AND conversation_id = ${conversationId}
        ORDER BY created_at
      `
    },

    async listByConversationSince(clinicId, conversationId, since) {
      return sql<ConversationMessage[]>`
        SELECT * FROM conversation_messages
        WHERE clinic_id = ${clinicId}
          AND conversation_id = ${conversationId}
          AND created_at > ${since}::timestamptz
        ORDER BY created_at
      `
    },

    async create(data) {
      const rows = await sql<ConversationMessage[]>`
        INSERT INTO conversation_messages
          (conversation_id, clinic_id, role, content, content_type,
           channel_message_id, audio_url, transcription, token_count, metadata)
        VALUES (
          ${data.conversationId},
          ${data.clinicId},
          ${data.role},
          ${data.content},
          ${data.contentType ?? 'text'},
          ${data.channelMessageId ?? null},
          ${data.audioUrl        ?? null},
          ${data.transcription   ?? null},
          ${data.tokenCount      ?? null},
          ${sql.json(toJson(data.metadata ?? {}))}
        )
        RETURNING *
      `
      const msg = rows[0]!

      // Bump conversation.last_message_at
      await sql`
        UPDATE conversations SET last_message_at = ${msg.createdAt}::timestamptz
        WHERE id = ${data.conversationId} AND clinic_id = ${data.clinicId}
      `

      return msg
    },

    async markDelivered(clinicId, id, channelMessageId) {
      await sql`
        UPDATE conversation_messages
        SET channel_message_id = ${channelMessageId}
        WHERE clinic_id = ${clinicId} AND id = ${id}
      `
      await sql`
        INSERT INTO message_delivery_events (message_id, clinic_id, channel_message_id, status)
        VALUES (${id}, ${clinicId}, ${channelMessageId}, 'sent')
      `
    },
  }
}
