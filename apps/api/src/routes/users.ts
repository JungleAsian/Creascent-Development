// Req 1 (IA Studio Admin Panel): clinic user management. List / create / edit /
// delete a clinic's panel users and assign their role. Managed by a clinic_admin
// (own clinic) or an ia_studio_admin (any clinic).
//   GET    /clinics/:id/users           (clinic_admin, ia_studio_admin)
//   POST   /clinics/:id/users           (clinic_admin, ia_studio_admin)
//   PATCH  /clinics/:id/users/:userId   (clinic_admin, ia_studio_admin)
//   DELETE /clinics/:id/users/:userId   (clinic_admin, ia_studio_admin)
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createUsersRepository, type ClinicUser, type ClinicUserWithRole } from '@docmee/db'
import { hashPassword } from '@docmee/shared'
import { withDb } from '../lib/db.js'
import { validate } from '../lib/validate.js'
import { resolveClinicScope } from '../lib/scope.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

// ia_studio_admin is the platform super-admin, not a clinic-inbox role — it is not
// assignable through per-clinic user management (mirrors the assign/inbox routes).
const assignableRole = z.enum(['secretary', 'doctor', 'clinic_admin'])
const statusEnum = z.enum(['active', 'inactive', 'invited'])

const createSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
  role: assignableRole,
  status: statusEnum.optional(),
  panelLanguage: z.enum(['es', 'en']).optional(),
})

const patchSchema = z
  .object({
    email: z.string().email().optional(),
    fullName: z.string().min(1).optional(),
    password: z.string().min(8).optional(),
    role: assignableRole.optional(),
    status: statusEnum.optional(),
    panelLanguage: z.enum(['es', 'en']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

/** Never expose a user's password hash to the panel. */
type SafeUser = Omit<ClinicUser, 'passwordHash'> & { role?: ClinicUserWithRole['role'] }
function redactUser(user: ClinicUser & { role?: ClinicUserWithRole['role'] }): SafeUser {
  const rest = { ...user } as Partial<ClinicUser> & { role?: ClinicUserWithRole['role'] }
  delete rest.passwordHash
  return rest as SafeUser
}

const usersRoute: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  // ── List clinic users with their roles ──
  app.get<{ Params: { id: string } }>(
    '/clinics/:id/users',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const users = await withDb(async (sql) => createUsersRepository(sql).listWithRoles(clinicId))
      return { users: users.map(redactUser) }
    },
  )

  // ── Create a clinic user ──
  app.post<{ Params: { id: string } }>(
    '/clinics/:id/users',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const parsed = validate(createSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const { email, fullName, password, role, status, panelLanguage } = parsed.data

      const result = await withDb(async (sql) => {
        const repo = createUsersRepository(sql)
        if (await repo.findByEmail(clinicId, email)) return { conflict: true as const }
        const user = await repo.create({
          clinicId,
          email,
          fullName: fullName ?? null,
          status,
          passwordHash: password ? hashPassword(password) : null,
          panelLanguage,
        })
        await repo.setRole(clinicId, user.id, role)
        return { user }
      })
      if ('conflict' in result) return reply.code(409).send({ error: 'Email already in use' })
      return reply.code(201).send({ user: redactUser({ ...result.user, role }) })
    },
  )

  // ── Update a clinic user ──
  app.patch<{ Params: { id: string; userId: string } }>(
    '/clinics/:id/users/:userId',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const parsed = validate(patchSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const { userId } = request.params
      const { email, fullName, password, role, status, panelLanguage } = parsed.data

      // Self-protection: a user cannot demote or deactivate their own account, which
      // would otherwise lock them (or the clinic) out of the panel.
      const isSelf = userId === request.user!.userId
      if (isSelf && role && role !== request.user!.role) {
        return reply.code(400).send({ error: 'You cannot change your own role' })
      }
      if (isSelf && status && status !== 'active') {
        return reply.code(400).send({ error: 'You cannot deactivate your own account' })
      }

      const result = await withDb(async (sql) => {
        const repo = createUsersRepository(sql)
        const existing = await repo.findById(clinicId, userId)
        if (!existing) return { notFound: true as const }
        if (email && email.toLowerCase() !== existing.email.toLowerCase()) {
          const dupe = await repo.findByEmail(clinicId, email)
          if (dupe && dupe.id !== userId) return { conflict: true as const }
        }
        const updated = await repo.update(clinicId, userId, {
          ...(email !== undefined ? { email } : {}),
          ...(fullName !== undefined ? { fullName } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(panelLanguage !== undefined ? { panelLanguage } : {}),
          ...(password !== undefined ? { passwordHash: hashPassword(password) } : {}),
        })
        if (!updated) return { notFound: true as const }
        if (role) await repo.setRole(clinicId, userId, role)
        return { user: updated }
      })
      if ('notFound' in result) return reply.code(404).send({ error: 'User not found' })
      if ('conflict' in result) return reply.code(409).send({ error: 'Email already in use' })
      return { user: redactUser({ ...result.user, ...(role ? { role } : {}) }) }
    },
  )

  // ── Delete a clinic user ──
  app.delete<{ Params: { id: string; userId: string } }>(
    '/clinics/:id/users/:userId',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      if (request.params.userId === request.user!.userId) {
        return reply.code(400).send({ error: 'You cannot delete your own account' })
      }
      const deleted = await withDb(async (sql) =>
        createUsersRepository(sql).delete(clinicId, request.params.userId),
      )
      if (!deleted) return reply.code(404).send({ error: 'User not found' })
      return { ok: true }
    },
  )
}

export default usersRoute
