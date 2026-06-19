import type { Sql } from '../client.js'
import { toJson } from '../client.js'
import type {
  ClinicUser,
  ClinicUserAuth,
  NotificationPrefsRow,
  PanelLanguage,
  PanelRole,
} from '../types/index.js'

export interface UsersRepository {
  findById(clinicId: string, id: string): Promise<ClinicUser | null>
  listByClinic(clinicId: string): Promise<ClinicUser[]>
  /** Email of the clinic's primary active user — the default alert recipient. */
  findPrimaryEmail(clinicId: string): Promise<string | null>
  /**
   * Email of an active clinic user holding the given role — the escalation
   * target (e.g. 'clinic_admin'). Null when no such user exists.
   */
  findEmailByRole(clinicId: string, role: PanelRole): Promise<string | null>
  /**
   * last_seen heartbeat of a clinic user by email (presence for alert routing).
   * Null when the email is unknown or the user has never been seen.
   */
  findLastSeenByEmail(clinicId: string, email: string): Promise<string | null>
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
  /** Raw notification preferences JSON for a user by id (clinic-scoped). Null if unknown. */
  getNotificationPrefs(clinicId: string, id: string): Promise<NotificationPrefsRow | null>
  /**
   * Raw notification preferences JSON for the alert recipient resolved by email
   * (clinic-scoped, active users) — the worker's email-routing gate. Empty object
   * when the email is unknown (i.e. permissive default in code).
   */
  findNotificationPrefsByEmail(clinicId: string, email: string): Promise<NotificationPrefsRow>
  /** Persist notification preferences for a user. Returns false if unknown. */
  setNotificationPrefs(id: string, prefs: NotificationPrefsRow): Promise<boolean>
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

    async findEmailByRole(clinicId, role) {
      const rows = await sql<[{ email: string }]>`
        SELECT u.email
        FROM clinic_users u
        JOIN user_roles ur ON ur.clinic_user_id = u.id
        JOIN roles r       ON r.id = ur.role_id
        WHERE u.clinic_id = ${clinicId}
          AND u.status    = 'active'
          AND r.name      = ${role}
        ORDER BY u.created_at
        LIMIT 1
      `
      return rows[0]?.email ?? null
    },

    async findLastSeenByEmail(clinicId, email) {
      const rows = await sql<[{ lastSeen: string | null }]>`
        SELECT last_seen FROM clinic_users
        WHERE clinic_id = ${clinicId} AND LOWER(email) = LOWER(${email}) AND status = 'active'
        ORDER BY created_at
        LIMIT 1
      `
      return rows[0]?.lastSeen ?? null
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

    async getNotificationPrefs(clinicId, id) {
      const rows = await sql<[{ prefs: NotificationPrefsRow }]>`
        SELECT notification_prefs AS prefs FROM clinic_users
        WHERE clinic_id = ${clinicId} AND id = ${id}
        LIMIT 1
      `
      return rows[0]?.prefs ?? null
    },

    async findNotificationPrefsByEmail(clinicId, email) {
      const rows = await sql<[{ prefs: NotificationPrefsRow }]>`
        SELECT notification_prefs AS prefs FROM clinic_users
        WHERE clinic_id = ${clinicId} AND LOWER(email) = LOWER(${email}) AND status = 'active'
        ORDER BY created_at
        LIMIT 1
      `
      return rows[0]?.prefs ?? {}
    },

    async setNotificationPrefs(id, prefs) {
      const rows = await sql<[{ id: string }]>`
        UPDATE clinic_users
        SET notification_prefs = ${sql.json(toJson(prefs))}
        WHERE id = ${id}
        RETURNING id
      `
      return rows.length > 0
    },
  }
}
