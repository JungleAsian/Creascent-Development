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
}

export interface ClinicsRepository {
  findById(id: string): Promise<Clinic | null>
  findBySlug(slug: string): Promise<Clinic | null>
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
          settings = CASE WHEN ${data.settings !== undefined} THEN ${sql.json(toJson(data.settings ?? {}))} ELSE settings END
        WHERE id = ${id}
        RETURNING *
      `
      if (!rows[0]) throw new Error(`Clinic not found: ${id}`)
      return rows[0]
    },
  }
}
