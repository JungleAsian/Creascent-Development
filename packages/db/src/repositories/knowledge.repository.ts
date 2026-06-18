import type { Sql } from '../client.js'
import { toJson } from '../client.js'
import type {
  KnowledgeDocument,
  KnowledgeChunk,
  IaProfile,
  IaRule,
  IaRuleType,
  DocumentType,
  DocumentStatus,
} from '../types/index.js'

export interface CreateDocumentInput {
  clinicId: string
  title: string
  content: string
  documentType?: DocumentType
  status?: DocumentStatus
  metadata?: Record<string, unknown>
}

export interface CreateChunkInput {
  documentId: string
  clinicId: string
  content: string
  chunkIndex: number
  metadata?: Record<string, unknown>
}

/** A KB chunk paired with its stored embedding, for in-process similarity search. */
export interface EmbeddedChunkRow {
  title: string
  content: string
  embedding: number[]
}

export interface CreateIaProfileInput {
  clinicId: string
  name: string
  systemPrompt?: string
  model?: string
  temperature?: number
  maxTokens?: number
  settings?: Record<string, unknown>
}

export interface UpdateIaProfileInput {
  name?: string
  systemPrompt?: string
  model?: string
  temperature?: number
  maxTokens?: number
  isActive?: boolean
  settings?: Record<string, unknown>
}

export interface CreateIaRuleInput {
  iaProfileId: string
  clinicId: string
  ruleType: IaRuleType
  condition?: Record<string, unknown>
  action?: Record<string, unknown>
  priority?: number
}

export interface KnowledgeRepository {
  listDocuments(clinicId: string): Promise<KnowledgeDocument[]>
  findDocument(clinicId: string, id: string): Promise<KnowledgeDocument | null>
  createDocument(data: CreateDocumentInput): Promise<KnowledgeDocument>
  updateDocumentStatus(clinicId: string, id: string, status: DocumentStatus): Promise<KnowledgeDocument>
  deleteDocument(clinicId: string, id: string): Promise<void>

  listChunks(clinicId: string, documentId: string): Promise<KnowledgeChunk[]>
  /** Chunks of active documents that carry an embedding, for KB retrieval. */
  listEmbeddedChunks(clinicId: string): Promise<EmbeddedChunkRow[]>
  createChunk(data: CreateChunkInput): Promise<KnowledgeChunk>
  replaceChunks(clinicId: string, documentId: string, chunks: Omit<CreateChunkInput, 'documentId' | 'clinicId'>[]): Promise<KnowledgeChunk[]>

  listIaProfiles(clinicId: string): Promise<IaProfile[]>
  findIaProfile(clinicId: string, id: string): Promise<IaProfile | null>
  createIaProfile(data: CreateIaProfileInput): Promise<IaProfile>
  updateIaProfile(clinicId: string, id: string, data: UpdateIaProfileInput): Promise<IaProfile>

  listIaRules(clinicId: string, iaProfileId: string): Promise<IaRule[]>
  createIaRule(data: CreateIaRuleInput): Promise<IaRule>
  deleteIaRule(clinicId: string, id: string): Promise<void>
}

export function createKnowledgeRepository(sql: Sql): KnowledgeRepository {
  return {
    async listDocuments(clinicId) {
      return sql<KnowledgeDocument[]>`
        SELECT * FROM knowledge_documents WHERE clinic_id = ${clinicId} ORDER BY created_at DESC
      `
    },

    async findDocument(clinicId, id) {
      const rows = await sql<KnowledgeDocument[]>`
        SELECT * FROM knowledge_documents WHERE clinic_id = ${clinicId} AND id = ${id} LIMIT 1
      `
      return rows[0] ?? null
    },

    async createDocument(data) {
      const rows = await sql<KnowledgeDocument[]>`
        INSERT INTO knowledge_documents (clinic_id, title, content, document_type, status, metadata)
        VALUES (
          ${data.clinicId},
          ${data.title},
          ${data.content},
          ${data.documentType ?? 'faq'},
          ${data.status       ?? 'draft'},
          ${sql.json(toJson(data.metadata ?? {}))}
        )
        RETURNING *
      `
      return rows[0]!
    },

    async updateDocumentStatus(clinicId, id, status) {
      const rows = await sql<KnowledgeDocument[]>`
        UPDATE knowledge_documents SET status = ${status}
        WHERE clinic_id = ${clinicId} AND id = ${id}
        RETURNING *
      `
      if (!rows[0]) throw new Error(`Document not found: ${id}`)
      return rows[0]
    },

    async deleteDocument(clinicId, id) {
      await sql`DELETE FROM knowledge_documents WHERE clinic_id = ${clinicId} AND id = ${id}`
    },

    async listChunks(clinicId, documentId) {
      return sql<KnowledgeChunk[]>`
        SELECT * FROM knowledge_chunks
        WHERE clinic_id = ${clinicId} AND document_id = ${documentId}
        ORDER BY chunk_index
      `
    },

    async listEmbeddedChunks(clinicId) {
      return sql<EmbeddedChunkRow[]>`
        SELECT d.title AS title,
               c.content AS content,
               c.metadata -> 'embedding' -> 'v' AS embedding
        FROM knowledge_chunks c
        JOIN knowledge_documents d
          ON d.id = c.document_id AND d.clinic_id = c.clinic_id
        WHERE c.clinic_id = ${clinicId}
          AND d.status = 'active'
          AND (c.metadata -> 'embedding') ? 'v'
      `
    },

    async createChunk(data) {
      const rows = await sql<KnowledgeChunk[]>`
        INSERT INTO knowledge_chunks (document_id, clinic_id, content, chunk_index, metadata)
        VALUES (
          ${data.documentId},
          ${data.clinicId},
          ${data.content},
          ${data.chunkIndex},
          ${sql.json(toJson(data.metadata ?? {}))}
        )
        RETURNING *
      `
      return rows[0]!
    },

    async replaceChunks(clinicId, documentId, chunks) {
      const results: KnowledgeChunk[] = []
      await sql.begin(async (tx) => {
        await tx`DELETE FROM knowledge_chunks WHERE clinic_id = ${clinicId} AND document_id = ${documentId}`
        for (const c of chunks) {
          const rows = await tx<KnowledgeChunk[]>`
            INSERT INTO knowledge_chunks (document_id, clinic_id, content, chunk_index, metadata)
            VALUES (
              ${documentId},
              ${clinicId},
              ${c.content},
              ${c.chunkIndex},
              ${tx.json(toJson(c.metadata ?? {}))}
            )
            RETURNING *
          `
          results.push(rows[0]!)
        }
      })
      return results
    },

    async listIaProfiles(clinicId) {
      return sql<IaProfile[]>`
        SELECT * FROM ia_profiles WHERE clinic_id = ${clinicId} ORDER BY name
      `
    },

    async findIaProfile(clinicId, id) {
      const rows = await sql<IaProfile[]>`
        SELECT * FROM ia_profiles WHERE clinic_id = ${clinicId} AND id = ${id} LIMIT 1
      `
      return rows[0] ?? null
    },

    async createIaProfile(data) {
      const rows = await sql<IaProfile[]>`
        INSERT INTO ia_profiles (clinic_id, name, system_prompt, model, temperature, max_tokens, settings)
        VALUES (
          ${data.clinicId},
          ${data.name},
          ${data.systemPrompt ?? ''},
          ${data.model        ?? 'claude-sonnet-4-6'},
          ${data.temperature  ?? 0.7},
          ${data.maxTokens    ?? 1024},
          ${sql.json(toJson(data.settings ?? {}))}
        )
        RETURNING *
      `
      return rows[0]!
    },

    async updateIaProfile(clinicId, id, data) {
      const rows = await sql<IaProfile[]>`
        UPDATE ia_profiles SET
          name          = COALESCE(${data.name          ?? null}, name),
          system_prompt = COALESCE(${data.systemPrompt  ?? null}, system_prompt),
          model         = COALESCE(${data.model         ?? null}, model),
          temperature   = COALESCE(${data.temperature   ?? null}, temperature),
          max_tokens    = COALESCE(${data.maxTokens     ?? null}, max_tokens),
          is_active     = COALESCE(${data.isActive      ?? null}, is_active),
          settings      = CASE WHEN ${data.settings !== undefined} THEN ${sql.json(toJson(data.settings ?? {}))} ELSE settings END
        WHERE clinic_id = ${clinicId} AND id = ${id}
        RETURNING *
      `
      if (!rows[0]) throw new Error(`IA profile not found: ${id}`)
      return rows[0]
    },

    async listIaRules(clinicId, iaProfileId) {
      return sql<IaRule[]>`
        SELECT * FROM ia_rules
        WHERE clinic_id = ${clinicId} AND ia_profile_id = ${iaProfileId} AND is_active = TRUE
        ORDER BY priority DESC, created_at
      `
    },

    async createIaRule(data) {
      const rows = await sql<IaRule[]>`
        INSERT INTO ia_rules (ia_profile_id, clinic_id, rule_type, condition, action, priority)
        VALUES (
          ${data.iaProfileId},
          ${data.clinicId},
          ${data.ruleType},
          ${sql.json(toJson(data.condition ?? {}))},
          ${sql.json(toJson(data.action    ?? {}))},
          ${data.priority ?? 0}
        )
        RETURNING *
      `
      return rows[0]!
    },

    async deleteIaRule(clinicId, id) {
      await sql`DELETE FROM ia_rules WHERE clinic_id = ${clinicId} AND id = ${id}`
    },
  }
}
