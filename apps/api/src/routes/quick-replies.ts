// Quick reply template routes (P16 — Gap #25).
//   GET    /clinics/:id/quick-reply-templates  (any authenticated user, own clinic — picker)
//   POST   /clinics/:id/quick-reply-templates  (clinic_admin, ia_studio_admin — IA Studio)
//   DELETE /clinics/:id/quick-reply-templates/:templateId (clinic_admin, ia_studio_admin)
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createQuickReplyTemplatesRepository } from '@docmee/db'
import { withDb } from '../lib/db.js'
import { validate } from '../lib/validate.js'
import { resolveClinicScope } from '../lib/scope.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const createSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

const quickRepliesRoute: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  // ── List (any clinic user — the composer picker reads this) ──
  app.get<{ Params: { id: string } }>(
    '/clinics/:id/quick-reply-templates',
    async (request, reply) => {
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const templates = await withDb(async (sql) =>
        createQuickReplyTemplatesRepository(sql).listByClinic(clinicId),
      )
      return { templates }
    },
  )

  // ── Create (IA Studio management) ──
  app.post<{ Params: { id: string } }>(
    '/clinics/:id/quick-reply-templates',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const parsed = validate(createSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const template = await withDb(async (sql) =>
        createQuickReplyTemplatesRepository(sql).create({
          clinicId,
          title: parsed.data.title,
          content: parsed.data.content,
        }),
      )
      return reply.code(201).send({ template })
    },
  )

  // ── Delete (IA Studio management) ──
  app.delete<{ Params: { id: string; templateId: string } }>(
    '/clinics/:id/quick-reply-templates/:templateId',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const removed = await withDb(async (sql) =>
        createQuickReplyTemplatesRepository(sql).delete(clinicId, request.params.templateId),
      )
      if (!removed) return reply.code(404).send({ error: 'Template not found' })
      return { removed: true }
    },
  )
}

export default quickRepliesRoute
