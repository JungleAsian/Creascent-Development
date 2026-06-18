// Patient routes (P08).
//   GET /patients/:id            (any authenticated user, own clinic)
//   GET /clinics/:id/patients    (clinic_admin, ia_studio_admin)
import type { FastifyPluginAsync } from 'fastify'
import { createPatientsRepository } from '@docmee/db'
import { withDb } from '../lib/db.js'
import { resolveClinicScope } from '../lib/scope.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const patientsRoute: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  app.get<{ Params: { id: string } }>('/patients/:id', async (request, reply) => {
    const clinicId = resolveClinicScope(request)
    if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
    const patient = await withDb(async (sql) =>
      createPatientsRepository(sql).findById(clinicId, request.params.id),
    )
    if (!patient) return reply.code(404).send({ error: 'Patient not found' })
    return { patient }
  })

  app.get<{ Params: { id: string } }>(
    '/clinics/:id/patients',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const patients = await withDb(async (sql) => createPatientsRepository(sql).list(clinicId))
      return { patients }
    },
  )
}

export default patientsRoute
