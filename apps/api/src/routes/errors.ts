// Error-review routes (P09 — IA Studio "Error Review" over bot_error_log/error_reviews).
//   GET  /clinics/:id/errors                  (clinic_admin, ia_studio_admin)
//   POST /clinics/:id/errors/:errorId/resolve (clinic_admin, ia_studio_admin)
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createErrorReviewsRepository } from '@docmee/db'
import type { ErrorReview } from '@docmee/db'
import { withDb } from '../lib/db.js'
import { validate } from '../lib/validate.js'
import { resolveClinicScope } from '../lib/scope.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const STATUS_VALUES = ['open', 'reviewed', 'resolved', 'ignored'] as const
const listQuerySchema = z.object({ status: z.enum(STATUS_VALUES).optional() })

const errorsRoute: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  app.get<{ Params: { id: string } }>(
    '/clinics/:id/errors',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const parsed = validate(listQuerySchema, request.query, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const errors = await withDb(async (sql) =>
        createErrorReviewsRepository(sql).listByClinic(
          clinicId,
          parsed.data.status as ErrorReview['status'] | undefined,
        ),
      )
      return { errors }
    },
  )

  app.post<{ Params: { id: string; errorId: string } }>(
    '/clinics/:id/errors/:errorId/resolve',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const error = await withDb(async (sql) =>
        createErrorReviewsRepository(sql).resolve(clinicId, request.params.errorId, request.user!.userId),
      )
      if (!error) return reply.code(404).send({ error: 'Error review not found' })
      return { error }
    },
  )
}

export default errorsRoute
