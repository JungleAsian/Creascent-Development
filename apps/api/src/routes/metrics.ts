// Metrics routes (P16 — Gap #27). Aggregated activity for the clinic dashboard.
//   GET /clinics/:id/metrics  (clinic_admin, ia_studio_admin — own clinic)
import type { FastifyPluginAsync } from 'fastify'
import { createClinicsRepository, createMetricsRepository } from '@docmee/db'
import { withDb } from '../lib/db.js'
import { resolveClinicScope } from '../lib/scope.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const metricsRoute: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  app.get<{ Params: { id: string } }>(
    '/clinics/:id/metrics',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const metrics = await withDb(async (sql) => {
        const clinic = await createClinicsRepository(sql).findById(clinicId)
        if (!clinic) return null
        return createMetricsRepository(sql).dashboard(clinicId, clinic.timezone)
      })
      if (!metrics) return reply.code(404).send({ error: 'Clinic not found' })
      return { metrics }
    },
  )
}

export default metricsRoute
