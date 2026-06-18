import type { Sql } from '../client.js'
import { toJson } from '../client.js'
import type { Clinic, ClinicPlan, ClinicStatus } from '../types/index.js'

export interface CreateClinicInput {
  name: string
  slug: string
  plan?: ClinicPlan
  status?: ClinicStatus
  settings?: Record<string, unknown>
  timezone?: string
}

export interface UpdateClinicInput {
  name?: string
  plan?: ClinicPlan
  status?: ClinicStatus
  settings?: Record<string, unknown>
  timezone?: string
  // P14 — Messenger connection. `messengerPageAccessToken` maps to the
  // *_encrypted column; pass it only when (re)setting the token.
  messengerPageId?: string
  messengerPageAccessToken?: string
  messengerWebhookVerifyToken?: string
  messengerEnabled?: boolean
}

export interface ClinicsRepository {
  findById(id: string): Promise<Clinic | null>
  findBySlug(slug: string): Promise<Clinic | null>
  /** Resolve the clinic that owns an inbound Messenger event by its Page id (enabled only). */
  findByMessengerPageId(pageId: string): Promise<Clinic | null>
  list(): Promise<Clinic[]>
  /** Count of clinics in the 'active' status — powers the IA Studio overview (Gap #8). */
  countActive(): Promise<number>
  create(data: CreateClinicInput): Promise<Clinic>
  update(id: string, data: UpdateClinicInput): Promise<Clinic>
}

export function createClinicsRepository(sql: Sql): ClinicsRepository {
  return {
    async findById(id) {
      const rows = await sql<Clinic[]>`SELECT * FROM clinics WHERE id = ${id} LIMIT 1`
      return rows[0] ?? null
    },

    async findBySlug(slug) {
      const rows = await sql<Clinic[]>`SELECT * FROM clinics WHERE slug = ${slug} LIMIT 1`
      return rows[0] ?? null
    },

    async findByMessengerPageId(pageId) {
      const rows = await sql<Clinic[]>`
        SELECT * FROM clinics
        WHERE messenger_page_id = ${pageId} AND messenger_enabled = TRUE
        LIMIT 1
      `
      return rows[0] ?? null
    },

    async list() {
      return sql<Clinic[]>`SELECT * FROM clinics ORDER BY created_at DESC`
    },

    async countActive() {
      const rows = await sql<[{ count: string }]>`
        SELECT COUNT(*) FROM clinics WHERE status = 'active'
      `
      return parseInt(rows[0]?.count ?? '0', 10)
    },

    async create(data) {
      const rows = await sql<Clinic[]>`
        INSERT INTO clinics (name, slug, plan, status, settings, timezone)
        VALUES (
          ${data.name},
          ${data.slug},
          ${data.plan ?? 'starter'},
          ${data.status ?? 'active'},
          ${sql.json(toJson(data.settings ?? {}))},
          ${data.timezone ?? 'America/Guatemala'}
        )
        RETURNING *
      `
      return rows[0]!
    },

    async update(id, data) {
      const rows = await sql<Clinic[]>`
        UPDATE clinics SET
          name     = COALESCE(${data.name     ?? null}, name),
          plan     = COALESCE(${data.plan     ?? null}, plan),
          status   = COALESCE(${data.status   ?? null}, status),
          timezone = COALESCE(${data.timezone ?? null}, timezone),
          messenger_page_id                     = COALESCE(${data.messengerPageId          ?? null}, messenger_page_id),
          messenger_page_access_token_encrypted = COALESCE(${data.messengerPageAccessToken ?? null}, messenger_page_access_token_encrypted),
          messenger_webhook_verify_token        = COALESCE(${data.messengerWebhookVerifyToken ?? null}, messenger_webhook_verify_token),
          messenger_enabled                     = COALESCE(${data.messengerEnabled         ?? null}, messenger_enabled),
          settings = CASE WHEN ${data.settings !== undefined} THEN ${sql.json(toJson(data.settings ?? {}))} ELSE settings END
        WHERE id = ${id}
        RETURNING *
      `
      if (!rows[0]) throw new Error(`Clinic not found: ${id}`)
      return rows[0]
    },
  }
}
