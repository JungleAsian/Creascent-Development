import type { Sql } from '../client.js'
import type { ClinicUser } from '../types/index.js'

export interface UsersRepository {
  findById(clinicId: string, id: string): Promise<ClinicUser | null>
  listByClinic(clinicId: string): Promise<ClinicUser[]>
  /** Email of the clinic's primary active user — the default alert recipient. */
  findPrimaryEmail(clinicId: string): Promise<string | null>
  /** Bump last_seen to NOW() (heartbeat). Returns false if the user is unknown. */
  touchLastSeen(id: string): Promise<boolean>
}

export function createUsersRepository(sql: Sql): UsersRepository {
  return {
    async findById(clinicId, id) {
      const rows = await sql<ClinicUser[]>`
        SELECT * FROM clinic_users WHERE clinic_id = ${clinicId} AND id = ${id} LIMIT 1
      `
      return rows[0] ?? null
    },

    async listByClinic(clinicId) {
      return sql<ClinicUser[]>`
        SELECT * FROM clinic_users WHERE clinic_id = ${clinicId} ORDER BY created_at
      `
    },

    async findPrimaryEmail(clinicId) {
      const rows = await sql<[{ email: string }]>`
        SELECT email FROM clinic_users
        WHERE clinic_id = ${clinicId} AND status = 'active'
        ORDER BY created_at
        LIMIT 1
      `
      return rows[0]?.email ?? null
    },

    async touchLastSeen(id) {
      const rows = await sql<[{ id: string }]>`
        UPDATE clinic_users SET last_seen = NOW() WHERE id = ${id} RETURNING id
      `
      return rows.length > 0
    },
  }
}
