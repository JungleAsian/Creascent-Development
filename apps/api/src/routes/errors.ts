// Error-review routes (P09 — IA Studio "Error Review" over bot_error_log/error_reviews).
//   GET  /clinics/:id/errors                     (clinic_admin, ia_studio_admin)
//   POST /clinics/:id/errors/:errorId/resolve    (clinic_admin, ia_studio_admin)
//   POST /clinics/:id/errors/:errorId/add-to-kb  (clinic_admin, ia_studio_admin) — Req 29
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createErrorReviewsRepository, createKnowledgeRepository } from '@docmee/db'
import type { ErrorReview } from '@docmee/db'
import { kbEmbedQueue } from '@docmee/queue'
import { withDb } from '../lib/db.js'
import { validate } from '../lib/validate.js'
import { resolveClinicScope } from '../lib/scope.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const STATUS_VALUES = ['open', 'reviewed', 'resolved', 'ignored'] as const
const listQuerySchema = z.object({ status: z.enum(STATUS_VALUES).optional() })
const addToKbSchema = z.object({ title: z.string().min(1), content: z.string().min(1) })

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

  // Add-to-KB (Req 29): turn a reviewed error — typically an unanswered question
  // or a bad bot response — into approved clinic knowledge. Creates a KB document,
  // enqueues embedding so the bot can retrieve it, and resolves the error in one
  // step so the operator's review action is atomic from the UI's perspective.
  app.post<{ Params: { id: string; errorId: string } }>(
    '/clinics/:id/errors/:errorId/add-to-kb',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const parsed = validate(addToKbSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

      const result = await withDb(async (sql) => {
        const errors = createErrorReviewsRepository(sql)
        const existing = await errors.findById(clinicId, request.params.errorId)
        if (!existing) return null
        const document = await createKnowledgeRepository(sql).createDocument({
          clinicId,
          title: parsed.data.title,
          content: parsed.data.content,
          documentType: 'faq',
          status: 'active',
          metadata: { source: 'error_review', errorReviewId: existing.id },
        })
        const error = await errors.resolve(clinicId, existing.id, request.user!.userId)
        return { document, error }
      })
      if (!result) return reply.code(404).send({ error: 'Error review not found' })
      // New content must be embedded before the bot can retrieve it.
      await kbEmbedQueue.add('embed-document', { clinicId, documentId: result.document.id })
      return reply.code(201).send(result)
    },
  )
}

export default errorsRoute
