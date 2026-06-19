// Conversation, message, tag and note routes (P08). All require auth; clinic
// access is scoped to the caller's clinic (ia_studio_admin may target any).
//   GET    /conversations                      (filters: clinic_id, status, assigned_to)
//   GET    /conversations/:id
//   POST   /conversations/:id/assign           (secretary, doctor, clinic_admin)
//   POST   /conversations/:id/close
//   POST   /conversations/:id/status           (Req 11 — set any of the 7 statuses)
//   POST   /conversations/:id/resume-bot        (secretary, doctor, clinic_admin) — return to bot
//   POST   /conversations/:id/reopen           → CREATES A NEW conversation (Decision 4)
//   GET    /conversations/:id/messages
//   POST   /conversations/:id/messages         (secretary, doctor, clinic_admin)
//   GET/POST/DELETE /conversations/:id/tags…   (Gap #13)
//   GET/POST        /conversations/:id/notes   (Gap #14 — internal, never sent to patient)
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createConversationsRepository, createMessagesRepository } from '@docmee/db'
import type { ConversationStatus } from '@docmee/db'
import { withDb } from '../lib/db.js'
import { validate } from '../lib/validate.js'
import { resolveClinicScope } from '../lib/scope.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

// Req 11: the 7-state conversation lifecycle.
const STATUS_VALUES = [
  'open',
  'pending',
  'assigned',
  'handoff',
  'snoozed',
  'resolved',
  'archived',
] as const

const listQuerySchema = z.object({
  clinic_id: z.string().optional(),
  status: z.enum(STATUS_VALUES).optional(),
  assigned_to: z.string().optional(),
})
const assignSchema = z.object({ userId: z.string().optional() })
const statusSchema = z.object({ status: z.enum(STATUS_VALUES) })
const messageSchema = z.object({
  content: z.string().min(1),
  contentType: z.enum(['text', 'audio', 'image', 'template', 'interactive']).optional(),
})
const tagSchema = z.object({ tag: z.string().min(1) })
const noteSchema = z.object({ content: z.string().min(1) })

const conversationsRoute: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  // ── List ──
  app.get('/', async (request, reply) => {
    const parsed = validate(listQuerySchema, request.query, reply)
    if (!parsed.ok) return
    const clinicId = resolveClinicScope(request, parsed.data.clinic_id)
    if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

    const conversations = await withDb(async (sql) => {
      const repo = createConversationsRepository(sql)
      const rows = await repo.listByClinic(clinicId, parsed.data.status as ConversationStatus | undefined)
      return parsed.data.assigned_to
        ? rows.filter((c) => c.assignedTo === parsed.data.assigned_to)
        : rows
    })
    return { conversations }
  })

  // ── Detail ──
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const clinicId = resolveClinicScope(request)
    if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
    const conversation = await withDb(async (sql) =>
      createConversationsRepository(sql).findById(clinicId, request.params.id),
    )
    if (!conversation) return reply.code(404).send({ error: 'Conversation not found' })
    return { conversation }
  })

  // ── Assign ──
  app.post<{ Params: { id: string } }>(
    '/:id/assign',
    { preHandler: requireRole('secretary', 'doctor', 'clinic_admin') },
    async (request, reply) => {
      const parsed = validate(assignSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const assignee = parsed.data.userId ?? request.user!.userId

      const conversation = await withDb(async (sql) => {
        const repo = createConversationsRepository(sql)
        const existing = await repo.findById(clinicId, request.params.id)
        if (!existing) return null
        return repo.update(clinicId, request.params.id, { assignedTo: assignee, status: 'assigned' })
      })
      if (!conversation) return reply.code(404).send({ error: 'Conversation not found' })
      return { conversation }
    },
  )

  // ── Close ──
  app.post<{ Params: { id: string } }>('/:id/close', async (request, reply) => {
    const clinicId = resolveClinicScope(request)
    if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
    const conversation = await withDb(async (sql) => {
      const repo = createConversationsRepository(sql)
      const existing = await repo.findById(clinicId, request.params.id)
      if (!existing) return null
      return repo.update(clinicId, request.params.id, { status: 'resolved' })
    })
    if (!conversation) return reply.code(404).send({ error: 'Conversation not found' })
    return { conversation }
  })

  // ── Set status (Req 11) — generic lifecycle transition ──
  // Moves a conversation to any of the 7 statuses (pending/snoozed/archived plus
  // open/resolved). Setting it back to `open` also clears the bot-pause metadata
  // so the bot truly resumes. The dedicated assign/close/resume-bot routes remain
  // the one-click paths for the common transitions.
  app.post<{ Params: { id: string } }>(
    '/:id/status',
    { preHandler: requireRole('secretary', 'doctor', 'clinic_admin') },
    async (request, reply) => {
      const parsed = validate(statusSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const conversation = await withDb(async (sql) => {
        const repo = createConversationsRepository(sql)
        const existing = await repo.findById(clinicId, request.params.id)
        if (!existing) return null
        const metadata: Record<string, unknown> = {
          ...existing.metadata,
          statusChangedAt: new Date().toISOString(),
        }
        if (parsed.data.status === 'open') {
          delete metadata.botPausedAt
          delete metadata.handoffReason
        }
        return repo.update(clinicId, request.params.id, { status: parsed.data.status, metadata })
      })
      if (!conversation) return reply.code(404).send({ error: 'Conversation not found' })
      return { conversation }
    },
  )

  // ── Return to bot (Rev1 #5/#6) — manual reactivation of a paused bot ──
  // Flips a human-owned conversation back to `open` so the bot resumes auto-
  // replying, and unassigns it. The counterpart to the human-takeover pause.
  app.post<{ Params: { id: string } }>(
    '/:id/resume-bot',
    { preHandler: requireRole('secretary', 'doctor', 'clinic_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const conversation = await withDb(async (sql) => {
        const repo = createConversationsRepository(sql)
        const existing = await repo.findById(clinicId, request.params.id)
        if (!existing) return null
        const metadata: Record<string, unknown> = {
          ...existing.metadata,
          botReactivatedAt: new Date().toISOString(),
        }
        delete metadata.botPausedAt
        delete metadata.handoffReason
        return repo.update(clinicId, request.params.id, {
          status: 'open',
          assignedTo: null,
          metadata,
        })
      })
      if (!conversation) return reply.code(404).send({ error: 'Conversation not found' })
      return { conversation }
    },
  )

  // ── Reopen → NEW conversation (Decision 4) ──
  app.post<{ Params: { id: string } }>('/:id/reopen', async (request, reply) => {
    const clinicId = resolveClinicScope(request)
    if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
    const created = await withDb(async (sql) => {
      const repo = createConversationsRepository(sql)
      const old = await repo.findById(clinicId, request.params.id)
      if (!old) return null
      return repo.create({
        clinicId,
        patientId: old.patientId ?? undefined,
        channel: old.channel,
        channelContactHandle: old.channelContactHandle,
        iaProfileId: old.iaProfileId ?? undefined,
        metadata: { reopenedFrom: old.id },
      })
    })
    if (!created) return reply.code(404).send({ error: 'Conversation not found' })
    return reply.code(201).send({ conversation: created })
  })

  // ── Messages ──
  app.get<{ Params: { id: string } }>('/:id/messages', async (request, reply) => {
    const clinicId = resolveClinicScope(request)
    if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
    const messages = await withDb(async (sql) => {
      const convo = await createConversationsRepository(sql).findById(clinicId, request.params.id)
      if (!convo) return null
      return createMessagesRepository(sql).listByConversation(clinicId, request.params.id)
    })
    if (messages === null) return reply.code(404).send({ error: 'Conversation not found' })
    return { messages }
  })

  app.post<{ Params: { id: string } }>(
    '/:id/messages',
    { preHandler: requireRole('secretary', 'doctor', 'clinic_admin') },
    async (request, reply) => {
      const parsed = validate(messageSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

      const message = await withDb(async (sql) => {
        const repo = createConversationsRepository(sql)
        const convo = await repo.findById(clinicId, request.params.id)
        if (!convo) return null
        const created = await createMessagesRepository(sql).create({
          conversationId: request.params.id,
          clinicId,
          role: 'agent',
          content: parsed.data.content,
          contentType: parsed.data.contentType ?? 'text',
          metadata: { authorId: request.user!.userId },
        })
        // Bot Interruption Rule (Rev1 #6): a manual human reply takes the
        // conversation over, so pause the bot. Only escalate an `open`
        // conversation — `assigned`/`handoff` are already human-owned, and
        // `resolved` stays closed.
        if (convo.status === 'open') {
          await repo.update(clinicId, request.params.id, {
            status: 'handoff',
            metadata: {
              ...convo.metadata,
              botPausedAt: new Date().toISOString(),
              handoffReason: 'human_reply',
            },
          })
        }
        return created
      })
      if (!message) return reply.code(404).send({ error: 'Conversation not found' })
      return reply.code(201).send({ message })
    },
  )

  // ── Tags (Gap #13) ──
  app.get<{ Params: { id: string } }>('/:id/tags', async (request, reply) => {
    const clinicId = resolveClinicScope(request)
    if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
    const tags = await withDb(async (sql) =>
      createConversationsRepository(sql).listTagsForConversation(clinicId, request.params.id),
    )
    return { tags }
  })

  app.post<{ Params: { id: string } }>('/:id/tags', async (request, reply) => {
    const parsed = validate(tagSchema, request.body, reply)
    if (!parsed.ok) return
    const clinicId = resolveClinicScope(request)
    if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
    const tag = await withDb(async (sql) => {
      const repo = createConversationsRepository(sql)
      const created = await repo.createTag({ clinicId, name: parsed.data.tag })
      await repo.addTag(clinicId, request.params.id, created.id)
      return created
    })
    return reply.code(201).send({ tag })
  })

  app.delete<{ Params: { id: string; tag: string } }>('/:id/tags/:tag', async (request, reply) => {
    const clinicId = resolveClinicScope(request)
    if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
    await withDb(async (sql) => {
      const repo = createConversationsRepository(sql)
      const tag = await repo.findTagByName(clinicId, request.params.tag)
      if (tag) await repo.removeTag(clinicId, request.params.id, tag.id)
    })
    return { removed: true }
  })

  // ── Notes (Gap #14 — internal only, never delivered to the patient) ──
  app.get<{ Params: { id: string } }>('/:id/notes', async (request, reply) => {
    const clinicId = resolveClinicScope(request)
    if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
    const notes = await withDb(async (sql) =>
      createConversationsRepository(sql).listNotes(clinicId, request.params.id),
    )
    return { notes }
  })

  app.post<{ Params: { id: string } }>('/:id/notes', async (request, reply) => {
    const parsed = validate(noteSchema, request.body, reply)
    if (!parsed.ok) return
    const clinicId = resolveClinicScope(request)
    if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
    const note = await withDb(async (sql) =>
      createConversationsRepository(sql).addNote({
        conversationId: request.params.id,
        clinicId,
        authorId: request.user!.userId,
        content: parsed.data.content,
      }),
    )
    return reply.code(201).send({ note })
  })
}

export default conversationsRoute
