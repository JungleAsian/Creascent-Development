// Knowledge-base routes (P08). KB content lives in knowledge_documents; embedding
// is offloaded to the kb-embed queue so the request returns immediately.
//   GET    /clinics/:id/kb               (any authenticated user, own clinic)
//   POST   /clinics/:id/kb               (clinic_admin, ia_studio_admin)
//   DELETE /clinics/:id/kb/:entryId      (clinic_admin, ia_studio_admin)
//   POST   /clinics/:id/kb/reembed       (clinic_admin, ia_studio_admin)
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createKnowledgeRepository, createDoctorsRepository } from '@docmee/db'
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
  // Per-doctor FAQ scope (Req 30); null/omitted = clinic-wide.
  doctorId: z.string().uuid().nullable().optional(),
})

// Either change the status, the doctor scope, or both — but at least one.
const patchSchema = z
  .object({
    status: z.enum(['active', 'draft', 'archived']).optional(),
    doctorId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => d.status !== undefined || d.doctorId !== undefined, {
    message: 'Provide status or doctorId',
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
      const { doctorId } = parsed.data
      const result = await withDb(async (sql) => {
        // A doctor-scoped FAQ (Req 30) must reference a doctor of THIS clinic.
        if (doctorId && !(await createDoctorsRepository(sql).findById(clinicId, doctorId))) {
          return { error: 'doctor_not_found' as const }
        }
        return {
          document: await createKnowledgeRepository(sql).createDocument({
            clinicId,
            title: parsed.data.title,
            content: parsed.data.content,
            documentType: parsed.data.documentType ?? 'faq',
            status: parsed.data.status ?? 'active',
            doctorId: doctorId ?? null,
          }),
        }
      })
      if ('error' in result) return reply.code(404).send({ error: 'Doctor not found' })
      // New content needs embedding before it can be retrieved.
      await kbEmbedQueue.add('embed-document', { clinicId, documentId: result.document.id })
      return reply.code(201).send({ document: result.document })
    },
  )

  app.patch<{ Params: { id: string; entryId: string } }>(
    '/clinics/:id/kb/:entryId',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const parsed = validate(patchSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const { status, doctorId } = parsed.data
      const result = await withDb(async (sql) => {
        const repo = createKnowledgeRepository(sql)
        let document = await repo.findDocument(clinicId, request.params.entryId)
        if (!document) return { error: 'not_found' as const }
        // A doctor-scoped FAQ (Req 30) must reference a doctor of THIS clinic.
        if (doctorId && !(await createDoctorsRepository(sql).findById(clinicId, doctorId))) {
          return { error: 'doctor_not_found' as const }
        }
        if (status !== undefined) {
          document = await repo.updateDocumentStatus(clinicId, request.params.entryId, status)
        }
        if (doctorId !== undefined) {
          document = await repo.setDocumentDoctor(clinicId, request.params.entryId, doctorId)
        }
        return { document }
      })
      if ('error' in result) {
        return reply
          .code(404)
          .send({ error: result.error === 'doctor_not_found' ? 'Doctor not found' : 'Document not found' })
      }
      return { document: result.document }
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
