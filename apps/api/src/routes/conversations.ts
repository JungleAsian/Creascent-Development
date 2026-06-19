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
//   GET/POST        /conversations/:id/notes        (Gap #14 — internal, never sent to patient)
//   PATCH/DELETE    /conversations/:id/notes/:noteId (Req 13 — author-only edit/delete)
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  createConversationsRepository,
  createMessagesRepository,
  createChannelAccountsRepository,
  createClinicsRepository,
  createErrorReviewsRepository,
  createMessageTemplatesRepository,
} from '@docmee/db'
import type { ConversationStatus } from '@docmee/db'
import { withDb } from '../lib/db.js'
import { fetchWhatsAppMedia } from '../lib/whatsapp-media.js'
import {
  sendWhatsAppText,
  sendWhatsAppTemplate,
  sendWhatsAppInteractive,
  sendMessengerText,
  sendInstagramText,
} from '../lib/channel-send.js'
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
const sendTemplateSchema = z.object({ templateId: z.string().min(1) })
// Req 3: an interactive reply-button menu — a body plus 1–3 buttons (WhatsApp's
// limit), each title ≤ 20 chars (Meta rejects longer titles).
const sendInteractiveSchema = z.object({
  body: z.string().min(1).max(1024),
  buttons: z.array(z.string().min(1).max(20)).min(1).max(3),
})
const tagSchema = z.object({ tag: z.string().min(1) })
const noteSchema = z.object({ content: z.string().min(1) })
// Req 29: a secretary flags a bad bot reply from the inbox; it surfaces in the
// IA Studio Error Review area as a `bad_response` entry.
const flagResponseSchema = z.object({
  messageId: z.string().optional(),
  content: z.string().min(1),
  note: z.string().optional(),
})

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
      const assignedTo = parsed.data.assigned_to
      if (!assignedTo) return rows
      // `unassigned` is a reserved sentinel for "no assignee"; any other value is a
      // user id (filter assigned work by user — Rev1 #35).
      return assignedTo === 'unassigned'
        ? rows.filter((c) => c.assignedTo == null)
        : rows.filter((c) => c.assignedTo === assignedTo)
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

  // ── Inbound media proxy (Req 3) — authenticated, on-demand WhatsApp image ──
  // A patient's image lives behind a short-lived, bearer-gated Meta URL, and the
  // browser can't attach the panel's JWT to an <img src>, so the inbox fetches the
  // image through this clinic-scoped proxy. The bytes are downloaded on demand and
  // streamed straight back — never persisted. Image messages only.
  app.get<{ Params: { id: string; messageId: string } }>(
    '/:id/messages/:messageId/media',
    async (request, reply) => {
      const clinicId = resolveClinicScope(request)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

      const resolved = await withDb(async (sql) => {
        const convo = await createConversationsRepository(sql).findById(clinicId, request.params.id)
        if (!convo) return { code: 404 as const }
        const message = await createMessagesRepository(sql).findById(clinicId, request.params.messageId)
        if (!message || message.conversationId !== request.params.id || message.contentType !== 'image') {
          return { code: 404 as const }
        }
        const mediaId = (message.metadata as { mediaId?: unknown }).mediaId
        if (typeof mediaId !== 'string') return { code: 404 as const }
        // The bearer token for the Graph media fetch lives on the clinic's active
        // WhatsApp channel account (same credential the inbound/outbound path uses).
        const accounts = await createChannelAccountsRepository(sql).listByClinic(clinicId)
        const account = accounts.find((a) => a.channel === 'whatsapp' && a.status === 'active')
        if (!account?.accessTokenEnc) return { code: 502 as const }
        return { code: 200 as const, mediaId, token: account.accessTokenEnc }
      })

      if (resolved.code !== 200) {
        return reply
          .code(resolved.code)
          .send({ error: resolved.code === 404 ? 'Media not found' : 'Channel not configured' })
      }

      try {
        const media = await fetchWhatsAppMedia(resolved.mediaId, resolved.token)
        return reply
          .header('content-type', media.mimeType)
          .header('cache-control', 'private, max-age=300')
          .send(Buffer.from(media.buffer))
      } catch (err) {
        request.log.error(`[media] download failed: ${(err as Error).message}`)
        return reply.code(502).send({ error: 'Media download failed' })
      }
    },
  )

  // A secretary's manual reply is DELIVERED to the patient over the conversation's
  // channel (Req 3/33/34) — not merely persisted. Mirrors the agent worker's send
  // transport: resolve the channel credentials, send, capture the provider message
  // id (wamid / Messenger+Instagram mid) and persist it as channel_message_id so
  // the delivery-status pipeline + the inbox ✓/✓✓/read indicator track this manual
  // reply exactly like a bot reply.
  app.post<{ Params: { id: string } }>(
    '/:id/messages',
    { preHandler: requireRole('secretary', 'doctor', 'clinic_admin') },
    async (request, reply) => {
      const parsed = validate(messageSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

      // Resolve the conversation and build the channel send transport. The Meta
      // send itself happens OUTSIDE the db callback so we don't hold a connection
      // across the network round-trip (mirrors the inbound media proxy). The
      // closure captures only primitives + a module-level sender, so it is safe to
      // call after the connection is released.
      const resolved = await withDb(async (sql) => {
        const convo = await createConversationsRepository(sql).findById(clinicId, request.params.id)
        if (!convo) return { code: 404 as const }

        let send: ((text: string) => Promise<string | null>) | null = null
        const recipient = convo.channelContactHandle
        if (convo.channel === 'messenger' || convo.channel === 'instagram') {
          // Messenger/Instagram tokens live on the clinic row (Req 33/34).
          const clinic = await createClinicsRepository(sql).findById(clinicId)
          if (convo.channel === 'messenger') {
            const token = clinic?.messengerEnabled ? clinic.messengerPageAccessTokenEncrypted : null
            if (token) send = (text) => sendMessengerText(token, recipient, text)
          } else {
            const token = clinic?.instagramEnabled ? clinic.instagramPageAccessTokenEncrypted : null
            if (token) send = (text) => sendInstagramText(token, recipient, text)
          }
        } else {
          // WhatsApp credentials live on the active channel account (Req 3).
          const accounts = await createChannelAccountsRepository(sql).listByClinic(clinicId)
          const account = accounts.find((a) => a.channel === 'whatsapp' && a.status === 'active')
          if (account?.accessTokenEnc) {
            const phoneNumberId = account.accountId
            const token = account.accessTokenEnc
            send = (text) => sendWhatsAppText(phoneNumberId, token, recipient, text)
          }
        }
        return { code: 200 as const, convo, recipient, send }
      })

      if (resolved.code === 404) return reply.code(404).send({ error: 'Conversation not found' })
      // No usable credentials for this channel (WhatsApp account inactive, or
      // Messenger/Instagram not connected) — there is no way to reach the patient.
      if (!resolved.send) return reply.code(502).send({ error: 'Channel not configured' })

      // Deliver to the patient. A failed send (expired/invalid token, rate limit,
      // a send rejected outside the 24-hour window) is recorded to the Error Review
      // area as `meta_send_failure` (Req 19/29) and surfaced to the secretary as a
      // 502 — the reply is NOT persisted, so the draft can be retried rather than
      // leaving a phantom "sent" bubble that never arrived.
      let channelMessageId: string | null = null
      try {
        channelMessageId = await resolved.send(parsed.data.content)
      } catch (err) {
        request.log.error(`[messages] channel send failed: ${(err as Error).message}`)
        await withDb((sql) =>
          createErrorReviewsRepository(sql).create({
            clinicId,
            errorType: 'meta_send_failure',
            errorMessage: err instanceof Error ? err.message : String(err),
            context: {
              conversationId: request.params.id,
              channel: resolved.convo.channel,
              recipient: resolved.recipient,
              sentBy: request.user!.userId,
            },
          }),
        ).catch((logErr) =>
          request.log.error(`[messages] failed to log send error: ${(logErr as Error).message}`),
        )
        return reply.code(502).send({ error: 'Message send failed' })
      }

      const message = await withDb(async (sql) => {
        const created = await createMessagesRepository(sql).create({
          conversationId: request.params.id,
          clinicId,
          role: 'agent',
          content: parsed.data.content,
          contentType: parsed.data.contentType ?? 'text',
          channelMessageId: channelMessageId ?? undefined,
          metadata: { authorId: request.user!.userId },
        })
        // Bot Interruption Rule (Rev1 #6): a manual human reply takes the
        // conversation over, so pause the bot. Only escalate an `open`
        // conversation — `assigned`/`handoff` are already human-owned, and
        // `resolved` stays closed.
        if (resolved.convo.status === 'open') {
          await createConversationsRepository(sql).update(clinicId, request.params.id, {
            status: 'handoff',
            metadata: {
              ...resolved.convo.metadata,
              botPausedAt: new Date().toISOString(),
              handoffReason: 'human_reply',
            },
          })
        }
        return created
      })
      return reply.code(201).send({ message })
    },
  )

  // ── Approved templates a secretary may send by hand (Req 3) ──
  // The clinic's APPROVED WhatsApp HSM templates — the only copy that can reach a
  // patient outside Meta's 24-hour customer-care window. Scoped to the
  // conversation's clinic so the inbox composer needn't hit the admin /clinics
  // routes (which a secretary can't). Templates are a WhatsApp concept; for a
  // Messenger/Instagram thread the picker simply shows nothing.
  app.get<{ Params: { id: string } }>(
    '/:id/templates',
    { preHandler: requireRole('secretary', 'doctor', 'clinic_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })
      const result = await withDb(async (sql) => {
        const convo = await createConversationsRepository(sql).findById(clinicId, request.params.id)
        if (!convo) return null
        if (convo.channel !== 'whatsapp') return []
        return createMessageTemplatesRepository(sql).listApproved(clinicId)
      })
      if (result === null) return reply.code(404).send({ error: 'Conversation not found' })
      return { templates: result }
    },
  )

  // ── Send an approved HSM template to the patient (Req 3) ──
  // A secretary re-engages a patient who is outside the 24h window by sending one
  // of the clinic's approved WhatsApp templates. Mirrors the manual-reply send: a
  // real `type:'template'` Meta message goes out, its wamid is captured so the
  // delivery-status pipeline + the inbox ✓/✓✓/read indicator track it, the
  // template body is persisted as the bubble text, and the Bot Interruption Rule
  // pauses the bot. Templates are WhatsApp-only (Messenger/Instagram → 400). A
  // pending/rejected/unknown template can never be sent (→ 404).
  app.post<{ Params: { id: string } }>(
    '/:id/send-template',
    { preHandler: requireRole('secretary', 'doctor', 'clinic_admin') },
    async (request, reply) => {
      const parsed = validate(sendTemplateSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

      const resolved = await withDb(async (sql) => {
        const convo = await createConversationsRepository(sql).findById(clinicId, request.params.id)
        if (!convo) return { code: 404 as const }
        // HSM templates are a WhatsApp-only mechanism.
        if (convo.channel !== 'whatsapp') return { code: 400 as const }
        const template = await createMessageTemplatesRepository(sql).findApprovedById(
          clinicId,
          parsed.data.templateId,
        )
        if (!template) return { code: 404 as const }
        const accounts = await createChannelAccountsRepository(sql).listByClinic(clinicId)
        const account = accounts.find((a) => a.channel === 'whatsapp' && a.status === 'active')
        if (!account?.accessTokenEnc) return { code: 502 as const }
        return {
          code: 200 as const,
          convo,
          template,
          phoneNumberId: account.accountId,
          token: account.accessTokenEnc,
          recipient: convo.channelContactHandle,
        }
      })

      if (resolved.code === 404) return reply.code(404).send({ error: 'Not found' })
      if (resolved.code === 400) {
        return reply.code(400).send({ error: 'Templates are only supported on WhatsApp' })
      }
      if (resolved.code === 502) return reply.code(502).send({ error: 'Channel not configured' })

      // Deliver the template. A failed send (expired/invalid token, an unapproved
      // template name, a rate limit) is recorded to the Error Review area as
      // `meta_send_failure` (Req 19/29) and surfaced as a 502 — nothing is persisted.
      let channelMessageId: string | null = null
      try {
        channelMessageId = await sendWhatsAppTemplate(
          resolved.phoneNumberId,
          resolved.token,
          resolved.recipient,
          resolved.template.name,
          resolved.template.language,
        )
      } catch (err) {
        request.log.error(`[send-template] channel send failed: ${(err as Error).message}`)
        await withDb((sql) =>
          createErrorReviewsRepository(sql).create({
            clinicId,
            errorType: 'meta_send_failure',
            errorMessage: err instanceof Error ? err.message : String(err),
            context: {
              conversationId: request.params.id,
              channel: 'whatsapp',
              recipient: resolved.recipient,
              templateName: resolved.template.name,
              sentBy: request.user!.userId,
            },
          }),
        ).catch((logErr) =>
          request.log.error(`[send-template] failed to log send error: ${(logErr as Error).message}`),
        )
        return reply.code(502).send({ error: 'Template send failed' })
      }

      const message = await withDb(async (sql) => {
        const created = await createMessagesRepository(sql).create({
          conversationId: request.params.id,
          clinicId,
          role: 'agent',
          content: resolved.template.body,
          contentType: 'template',
          channelMessageId: channelMessageId ?? undefined,
          metadata: {
            authorId: request.user!.userId,
            templateId: resolved.template.id,
            templateName: resolved.template.name,
          },
        })
        // Bot Interruption Rule (Rev1 #6): sending a template is a human takeover.
        if (resolved.convo.status === 'open') {
          await createConversationsRepository(sql).update(clinicId, request.params.id, {
            status: 'handoff',
            metadata: {
              ...resolved.convo.metadata,
              botPausedAt: new Date().toISOString(),
              handoffReason: 'human_reply',
            },
          })
        }
        return created
      })
      return reply.code(201).send({ message })
    },
  )

  // ── Send an interactive reply-button menu to the patient (Req 3) ──
  // A secretary offers the patient a small set of tappable choices (e.g. "Sí,
  // confirmar" / "Reprogramar" / "Cancelar"). Mirrors the manual-reply send: a real
  // `type:'interactive'` WhatsApp message goes out, its wamid is captured so the
  // delivery-status pipeline + the inbox ✓/✓✓/read indicator track it, the body is
  // persisted as the bubble text (the offered buttons in metadata), and the Bot
  // Interruption Rule pauses the bot. When the patient taps a button the inbound
  // webhook's interactive parsing feeds the tapped title back as ordinary message
  // text, closing the loop. WhatsApp-only (Messenger/Instagram → 400).
  app.post<{ Params: { id: string } }>(
    '/:id/send-interactive',
    { preHandler: requireRole('secretary', 'doctor', 'clinic_admin') },
    async (request, reply) => {
      const parsed = validate(sendInteractiveSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

      const resolved = await withDb(async (sql) => {
        const convo = await createConversationsRepository(sql).findById(clinicId, request.params.id)
        if (!convo) return { code: 404 as const }
        // Interactive button menus are a WhatsApp-only mechanism here.
        if (convo.channel !== 'whatsapp') return { code: 400 as const }
        const accounts = await createChannelAccountsRepository(sql).listByClinic(clinicId)
        const account = accounts.find((a) => a.channel === 'whatsapp' && a.status === 'active')
        if (!account?.accessTokenEnc) return { code: 502 as const }
        return {
          code: 200 as const,
          convo,
          phoneNumberId: account.accountId,
          token: account.accessTokenEnc,
          recipient: convo.channelContactHandle,
        }
      })

      if (resolved.code === 404) return reply.code(404).send({ error: 'Conversation not found' })
      if (resolved.code === 400) {
        return reply.code(400).send({ error: 'Interactive menus are only supported on WhatsApp' })
      }
      if (resolved.code === 502) return reply.code(502).send({ error: 'Channel not configured' })

      // Deliver the menu. A failed send (expired/invalid token, a send rejected
      // outside the 24h window, rate limit) is recorded to the Error Review area as
      // `meta_send_failure` (Req 19/29) and surfaced as a 502 — nothing is persisted.
      let channelMessageId: string | null = null
      try {
        channelMessageId = await sendWhatsAppInteractive(
          resolved.phoneNumberId,
          resolved.token,
          resolved.recipient,
          parsed.data.body,
          parsed.data.buttons,
        )
      } catch (err) {
        request.log.error(`[send-interactive] channel send failed: ${(err as Error).message}`)
        await withDb((sql) =>
          createErrorReviewsRepository(sql).create({
            clinicId,
            errorType: 'meta_send_failure',
            errorMessage: err instanceof Error ? err.message : String(err),
            context: {
              conversationId: request.params.id,
              channel: 'whatsapp',
              recipient: resolved.recipient,
              sentBy: request.user!.userId,
            },
          }),
        ).catch((logErr) =>
          request.log.error(`[send-interactive] failed to log send error: ${(logErr as Error).message}`),
        )
        return reply.code(502).send({ error: 'Interactive send failed' })
      }

      const message = await withDb(async (sql) => {
        const created = await createMessagesRepository(sql).create({
          conversationId: request.params.id,
          clinicId,
          role: 'agent',
          content: parsed.data.body,
          contentType: 'interactive',
          channelMessageId: channelMessageId ?? undefined,
          metadata: {
            authorId: request.user!.userId,
            buttons: parsed.data.buttons,
          },
        })
        // Bot Interruption Rule (Rev1 #6): offering a menu is a human takeover.
        if (resolved.convo.status === 'open') {
          await createConversationsRepository(sql).update(clinicId, request.params.id, {
            status: 'handoff',
            metadata: {
              ...resolved.convo.metadata,
              botPausedAt: new Date().toISOString(),
              handoffReason: 'human_reply',
            },
          })
        }
        return created
      })
      return reply.code(201).send({ message })
    },
  )

  // ── Flag a bad bot response (Req 29 Error Review) ──
  // A secretary marks a specific bot reply as wrong/inappropriate from the inbox;
  // it lands in the IA Studio Error Review queue as a `bad_response` entry where an
  // operator can review it and (Add-to-KB) correct the underlying knowledge.
  app.post<{ Params: { id: string } }>(
    '/:id/flag-response',
    { preHandler: requireRole('secretary', 'doctor', 'clinic_admin') },
    async (request, reply) => {
      const parsed = validate(flagResponseSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

      const error = await withDb(async (sql) => {
        const convo = await createConversationsRepository(sql).findById(clinicId, request.params.id)
        if (!convo) return null
        return createErrorReviewsRepository(sql).create({
          clinicId,
          errorType: 'bad_response',
          errorMessage: parsed.data.content,
          context: {
            conversationId: request.params.id,
            messageId: parsed.data.messageId ?? null,
            note: parsed.data.note ?? null,
            channel: convo.channel,
            flaggedBy: request.user!.userId,
          },
        })
      })
      if (!error) return reply.code(404).send({ error: 'Conversation not found' })
      return reply.code(201).send({ error })
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

  // Edit / delete are restricted to the note's own author — a note belongs to the
  // person who wrote it. (Still never reaches the patient; internal_notes is wholly
  // separate from conversation_messages / the WhatsApp send path.)
  app.patch<{ Params: { id: string; noteId: string } }>(
    '/:id/notes/:noteId',
    { preHandler: requireRole('secretary', 'doctor', 'clinic_admin') },
    async (request, reply) => {
      const parsed = validate(noteSchema, request.body, reply)
      if (!parsed.ok) return
      const clinicId = resolveClinicScope(request)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

      const result = await withDb(async (sql) => {
        const repo = createConversationsRepository(sql)
        const existing = await repo.findNoteById(clinicId, request.params.noteId)
        if (!existing) return { code: 404 as const }
        if (existing.authorId !== request.user!.userId) return { code: 403 as const }
        const note = await repo.updateNote(clinicId, request.params.noteId, parsed.data.content)
        return { code: 200 as const, note }
      })
      if (result.code !== 200) return reply.code(result.code).send({ error: result.code === 404 ? 'Note not found' : 'Forbidden' })
      return { note: result.note }
    },
  )

  app.delete<{ Params: { id: string; noteId: string } }>(
    '/:id/notes/:noteId',
    { preHandler: requireRole('secretary', 'doctor', 'clinic_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

      const result = await withDb(async (sql) => {
        const repo = createConversationsRepository(sql)
        const existing = await repo.findNoteById(clinicId, request.params.noteId)
        if (!existing) return { code: 404 as const }
        if (existing.authorId !== request.user!.userId) return { code: 403 as const }
        await repo.deleteNote(clinicId, request.params.noteId)
        return { code: 200 as const }
      })
      if (result.code !== 200) return reply.code(result.code).send({ error: result.code === 404 ? 'Note not found' : 'Forbidden' })
      return { deleted: true }
    },
  )
}

export default conversationsRoute
