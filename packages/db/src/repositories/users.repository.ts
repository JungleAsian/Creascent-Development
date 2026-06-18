import type { Sql } from '../client.js'
import type { ClinicUser, ClinicUserAuth, PanelLanguage, PanelRole } from '../types/index.js'

export interface UsersRepository {
  findById(clinicId: string, id: string): Promise<ClinicUser | null>
  listByClinic(clinicId: string): Promise<ClinicUser[]>
  /** Email of the clinic's primary active user — the default alert recipient. */
  findPrimaryEmail(clinicId: string): Promise<string | null>
  /** Bump last_seen to NOW() (heartbeat). Returns false if the user is unknown. */
  touchLastSeen(id: string): Promise<boolean>
  /**
   * Look up a clinic user by email for login. Returns the stored password hash
   * and the user's highest-privilege role name (resolved from user_roles/roles).
   * Email match is case-insensitive. Returns null if no such user exists.
   */
  findAuthByEmail(email: string): Promise<ClinicUserAuth | null>
  /** Persist the panel UI language preference. Returns false if the user is unknown. */
  setPanelLanguage(id: string, language: PanelLanguage): Promise<boolean>
}

// Highest privilege wins when a user holds several roles. Unknown role names
// fall back to the least-privileged 'secretary'.
const ROLE_RANK: Record<PanelRole, number> = {
  ia_studio_admin: 4,
  clinic_admin: 3,
  doctor: 2,
  secretary: 1,
}

function resolveRole(names: string[]): PanelRole {
  let best: PanelRole = 'secretary'
  for (const name of names) {
    if (name in ROLE_RANK && ROLE_RANK[name as PanelRole] > ROLE_RANK[best]) {
      best = name as PanelRole
    }
  }
  return best
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

    async findAuthByEmail(email) {
      const rows = await sql<
        {
          id: string
          clinicId: string
          email: string
          fullName: string | null
          status: ClinicUserAuth['status']
          passwordHash: string | null
          panelLanguage: PanelLanguage
          roleNames: string[]
        }[]
      >`
        SELECT u.id,
               u.clinic_id      AS clinic_id,
               u.email,
               u.full_name      AS full_name,
               u.status,
               u.password_hash  AS password_hash,
               u.panel_language AS panel_language,
               COALESCE(
                 ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL),
                 '{}'
               )                AS role_names
        FROM clinic_users u
        LEFT JOIN user_roles ur ON ur.clinic_user_id = u.id
        LEFT JOIN roles r       ON r.id = ur.role_id
        WHERE LOWER(u.email) = LOWER(${email})
        GROUP BY u.id
        LIMIT 1
      `
      const row = rows[0]
      if (!row) return null
      return {
        id: row.id,
        clinicId: row.clinicId,
        email: row.email,
        fullName: row.fullName,
        status: row.status,
        passwordHash: row.passwordHash,
        panelLanguage: row.panelLanguage,
        role: resolveRole(row.roleNames ?? []),
      }
    },

    async setPanelLanguage(id, language) {
      const rows = await sql<[{ id: string }]>`
        UPDATE clinic_users SET panel_language = ${language} WHERE id = ${id} RETURNING id
      `
      return rows.length > 0
    },
  }
}
