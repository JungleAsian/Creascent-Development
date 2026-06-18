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
import { withDb } from '../lib/db.js'
import { validate } from '../lib/validate.js'
import { resolveClinicScope } from '../lib/scope.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

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
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

const clinicsRoute: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  // ── List all clinics (IA Studio) ──
  app.get('/', { preHandler: requireRole('ia_studio_admin') }, async () => {
    const clinics = await withDb(async (sql) => createClinicsRepository(sql).list())
    return { clinics }
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
    return reply.code(201).send({ clinic })
  })

  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const clinic = await withDb(async (sql) => createClinicsRepository(sql).findById(clinicId))
      if (!clinic) return reply.code(404).send({ error: 'Clinic not found' })
      return { clinic }
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
      const clinic = await withDb(async (sql) => {
        const repo = createClinicsRepository(sql)
        if (!(await repo.findById(clinicId))) return null
        return repo.update(clinicId, parsed.data)
      })
      if (!clinic) return reply.code(404).send({ error: 'Clinic not found' })
      return { clinic }
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
