// Knowledge-base routes (P08). KB content lives in knowledge_documents; embedding
// is offloaded to the kb-embed queue so the request returns immediately.
//   GET    /clinics/:id/kb               (any authenticated user, own clinic)
//   POST   /clinics/:id/kb               (clinic_admin, ia_studio_admin)
//   DELETE /clinics/:id/kb/:entryId      (clinic_admin, ia_studio_admin)
//   POST   /clinics/:id/kb/reembed       (clinic_admin, ia_studio_admin)
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createKnowledgeRepository } from '@docmee/db'
import { kbEmbedQueue } from '@docmee/queue'
import { withDb } from '../lib/db.js'
import { validate } from '../lib/validate.js'
import { resolveClinicScope } from '../lib/scope.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const createSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  documentType: z.enum(['faq', 'policy', 'service_info', 'custom']).optional(),
  status: z.enum(['active', 'draft', 'archived']).optional(),
})

const kbRoute: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  app.get<{ Params: { id: string } }>('/clinics/:id/kb', async (request, reply) => {
    const clinicId = resolveClinicScope(request, request.params.id)
    if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
    const documents = await withDb(async (sql) =>
      createKnowledgeRepository(sql).listDocuments(clinicId),
    )
    return { documents }
  })

  app.post<{ Params: { id: string } }>(
    '/clinics/:id/kb',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const parsed = validate(createSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const document = await withDb(async (sql) =>
        createKnowledgeRepository(sql).createDocument({
          clinicId,
          title: parsed.data.title,
          content: parsed.data.content,
          documentType: parsed.data.documentType ?? 'faq',
          status: parsed.data.status ?? 'active',
        }),
      )
      // New content needs embedding before it can be retrieved.
      await kbEmbedQueue.add('embed-document', { clinicId, documentId: document.id })
      return reply.code(201).send({ document })
    },
  )

  app.delete<{ Params: { id: string; entryId: string } }>(
    '/clinics/:id/kb/:entryId',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      await withDb(async (sql) =>
        createKnowledgeRepository(sql).deleteDocument(clinicId, request.params.entryId),
      )
      return { deleted: true }
    },
  )

  app.post<{ Params: { id: string } }>(
    '/clinics/:id/kb/reembed',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      await kbEmbedQueue.add('reembed-clinic', { clinicId })
      return reply.code(202).send({ queued: true })
    },
  )
}

export default kbRoute
