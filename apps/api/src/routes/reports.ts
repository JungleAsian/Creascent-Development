// Req 37 — Automatic reports. Lets a clinic admin read the scheduled reports the
// reports worker generates (the "panel" delivery channel alongside email).
//   GET /clinics/:id/reports             list (newest first, no html body)
//   GET /clinics/:id/reports/:reportId   one report incl. the rendered html
// clinic_admin / ia_studio_admin, own clinic only.
import type { FastifyPluginAsync } from 'fastify'
import { createClinicsRepository, createReportsRepository } from '@docmee/db'
import { withDb } from '../lib/db.js'
import { resolveClinicScope } from '../lib/scope.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const reportsRoute: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  app.get<{ Params: { id: string } }>(
    '/clinics/:id/reports',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

      const result = await withDb(async (sql) => {
        const clinic = await createClinicsRepository(sql).findById(clinicId)
        if (!clinic) return null
        return createReportsRepository(sql).listByClinic(clinicId)
      })
      if (!result) return reply.code(404).send({ error: 'Clinic not found' })
      return { reports: result }
    },
  )

  app.get<{ Params: { id: string; reportId: string } }>(
    '/clinics/:id/reports/:reportId',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

      const report = await withDb((sql) =>
        createReportsRepository(sql).findById(clinicId, request.params.reportId),
      )
      if (!report) return reply.code(404).send({ error: 'Report not found' })
      return { report }
    },
  )
}

export default reportsRoute
