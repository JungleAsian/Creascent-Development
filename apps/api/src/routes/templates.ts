// WhatsApp message template routes (P16 — Gap #29). Actual submission to Meta is
// manual; these routes only track the catalog and approval status the panel shows.
//   GET   /clinics/:id/message-templates              (clinic_admin, ia_studio_admin)
//   POST  /clinics/:id/message-templates              (clinic_admin, ia_studio_admin — "submit")
//   PATCH /clinics/:id/message-templates/:templateId  (ia_studio_admin — set approval status)
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createMessageTemplatesRepository } from '@docmee/db'
import { withDb } from '../lib/db.js'
import { validate } from '../lib/validate.js'
import { resolveClinicScope } from '../lib/scope.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const createSchema = z.object({
  name: z.string().min(1),
  category: z.enum([
    'appointment_confirmation',
    'appointment_reminder',
    'human_handoff_notification',
  ]),
  language: z.string().min(2).optional(),
  body: z.string().min(1),
})

const patchSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
})

const templatesRoute: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  // ── List submitted templates ──
  app.get<{ Params: { id: string } }>(
    '/clinics/:id/message-templates',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const templates = await withDb(async (sql) =>
        createMessageTemplatesRepository(sql).listByClinic(clinicId),
      )
      return { templates }
    },
  )

  // ── Submit a new template (tracked as pending) ──
  app.post<{ Params: { id: string } }>(
    '/clinics/:id/message-templates',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const parsed = validate(createSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const template = await withDb(async (sql) =>
        createMessageTemplatesRepository(sql).create({
          clinicId,
          name: parsed.data.name,
          category: parsed.data.category,
          language: parsed.data.language,
          body: parsed.data.body,
        }),
      )
      return reply.code(201).send({ template })
    },
  )

  // ── Update approval status (admins reconcile Meta's decision) ──
  app.patch<{ Params: { id: string; templateId: string } }>(
    '/clinics/:id/message-templates/:templateId',
    { preHandler: requireRole('ia_studio_admin') },
    async (request, reply) => {
      const parsed = validate(patchSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const template = await withDb(async (sql) =>
        createMessageTemplatesRepository(sql).setStatus(
          clinicId,
          request.params.templateId,
          parsed.data.status,
        ),
      )
      if (!template) return reply.code(404).send({ error: 'Template not found' })
      return { template }
    },
  )
}

export default templatesRoute
