// Clinic routes (P08, extended P09 for IA Studio).
//   GET   /clinics              (ia_studio_admin — list all clinics)
//   POST  /clinics              (ia_studio_admin — create a clinic)
//   GET   /clinics/:id          (clinic_admin, ia_studio_admin)
//   PATCH /clinics/:id          (clinic_admin, ia_studio_admin)
//   GET   /clinics/:id/stats    (any authenticated user, own clinic)
//   GET   /clinics/:id/team     (any authenticated user, own clinic — AssignPanel)
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  createClinicsRepository,
  createConversationsRepository,
  createPatientsRepository,
  createUsersRepository,
} from '@docmee/db'
import { encryptValue } from '@docmee/shared'
import { withDb } from '../lib/db.js'
import { validate } from '../lib/validate.js'
import { resolveClinicScope } from '../lib/scope.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import type { Clinic } from '@docmee/db'

// The Messenger/Instagram Page tokens are write-only — never echo them to the panel.
type RedactedClinic = Omit<
  Clinic,
  'messengerPageAccessTokenEncrypted' | 'instagramPageAccessTokenEncrypted'
>
function redactClinic(clinic: Clinic): RedactedClinic {
  const rest = { ...clinic } as Partial<Clinic>
  delete rest.messengerPageAccessTokenEncrypted
  delete rest.instagramPageAccessTokenEncrypted
  return rest as RedactedClinic
}

const createSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, numbers and dashes'),
  plan: z.enum(['starter', 'pro', 'enterprise']).optional(),
  status: z.enum(['active', 'suspended', 'cancelled']).optional(),
  timezone: z.string().min(1).optional(),
})

const patchSchema = z
  .object({
    name: z.string().min(1).optional(),
    plan: z.enum(['starter', 'pro', 'enterprise']).optional(),
    status: z.enum(['active', 'suspended', 'cancelled']).optional(),
    timezone: z.string().min(1).optional(),
    settings: z.record(z.unknown()).optional(),
    // P14 — Facebook Messenger connection. Token is write-only; omit to keep it.
    messengerPageId: z.string().optional(),
    messengerPageAccessToken: z.string().min(1).optional(),
    messengerWebhookVerifyToken: z.string().optional(),
    messengerEnabled: z.boolean().optional(),
    // P15 — Instagram Direct connection. Token is write-only; omit to keep it.
    instagramAccountId: z.string().optional(),
    instagramPageAccessToken: z.string().min(1).optional(),
    instagramWebhookVerifyToken: z.string().optional(),
    instagramEnabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

const clinicsRoute: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  // ── List all clinics (IA Studio) ──
  app.get('/', { preHandler: requireRole('ia_studio_admin') }, async () => {
    const clinics = await withDb(async (sql) => createClinicsRepository(sql).list())
    return { clinics: clinics.map(redactClinic) }
  })

  // ── Create a clinic (IA Studio) ──
  app.post('/', { preHandler: requireRole('ia_studio_admin') }, async (request, reply) => {
    const parsed = validate(createSchema, request.body, reply)
    if (!parsed.ok) return
    const clinic = await withDb(async (sql) => {
      const repo = createClinicsRepository(sql)
      if (await repo.findBySlug(parsed.data.slug)) return null
      return repo.create(parsed.data)
    })
    if (!clinic) return reply.code(409).send({ error: 'Slug already in use' })
    return reply.code(201).send({ clinic: redactClinic(clinic) })
  })

  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const clinic = await withDb(async (sql) => createClinicsRepository(sql).findById(clinicId))
      if (!clinic) return reply.code(404).send({ error: 'Clinic not found' })
      return { clinic: redactClinic(clinic) }
    },
  )

  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const parsed = validate(patchSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      // Encrypt Meta Page tokens at rest (the columns are named *_encrypted but the
      // values were stored in plaintext). Mirrors the doctors/calendar token pattern.
      const data = { ...parsed.data }
      if (data.messengerPageAccessToken) data.messengerPageAccessToken = encryptValue(data.messengerPageAccessToken)
      if (data.instagramPageAccessToken) data.instagramPageAccessToken = encryptValue(data.instagramPageAccessToken)
      const isStudioAdmin = request.user?.role === 'ia_studio_admin'
      const clinic = await withDb(async (sql) => {
        const repo = createClinicsRepository(sql)
        const existing = await repo.findById(clinicId)
        if (!existing) return null
        // Merge settings onto the existing blob instead of replacing it, so a PATCH
        // can't wipe license/credential keys it didn't include. Only ia_studio_admin
        // may set the protected license_key via the generic settings object.
        if (data.settings) {
          const incoming: Record<string, unknown> = { ...data.settings }
          if (!isStudioAdmin) delete incoming.license_key
          const current = (existing.settings as Record<string, unknown> | null | undefined) ?? {}
          data.settings = { ...current, ...incoming }
        }
        return repo.update(clinicId, data)
      })
      if (!clinic) return reply.code(404).send({ error: 'Clinic not found' })
      return { clinic: redactClinic(clinic) }
    },
  )

  app.get<{ Params: { id: string } }>('/:id/stats', async (request, reply) => {
    const clinicId = resolveClinicScope(request, request.params.id)
    if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
    const stats = await withDb(async (sql) => {
      const conversations = createConversationsRepository(sql)
      const patients = createPatientsRepository(sql)
      const [activeConversations, patientRows] = await Promise.all([
        conversations.countActive(clinicId),
        patients.list(clinicId),
      ])
      const base = { activeConversations, totalPatients: patientRows.length }
      if (request.user!.role === 'ia_studio_admin') {
        return { ...base, activeClinics: await createClinicsRepository(sql).countActive() }
      }
      return base
    })
    return { stats }
  })

  // ── Team members (AssignPanel — Gap #12) ──
  app.get<{ Params: { id: string } }>('/:id/team', async (request, reply) => {
    const clinicId = resolveClinicScope(request, request.params.id)
    if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
    const members = await withDb(async (sql) => createUsersRepository(sql).listByClinic(clinicId))
    // Only expose the fields the assign UI needs — never the password hash.
    return {
      members: members.map((m) => ({
        id: m.id,
        fullName: m.fullName,
        email: m.email,
        status: m.status,
      })),
    }
  })
}

export default clinicsRoute
