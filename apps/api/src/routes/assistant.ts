// Internal AI Assistant for secretaries (Req 41). STAFF-ONLY inbox aid:
//   POST /conversations/:id/assist/summary       → { summary }
//   POST /conversations/:id/assist/suggestions    → { suggestions, sources }
//
// Both endpoints READ a conversation and return generated text to the panel. They
// NEVER send anything to the patient — there is no channel-send call here; the
// secretary reviews/edits and sends manually via the normal /messages route. Gated
// to clinic-inbox roles (secretary/doctor/clinic_admin); ia_studio_admin (platform
// super-admin, not an inbox role) is excluded, matching the other inbox routes.
import type { FastifyPluginAsync } from 'fastify'
import {
  createConversationsRepository,
  createMessagesRepository,
  createPatientsRepository,
  createKnowledgeRepository,
  createClinicsRepository,
} from '@docmee/db'
import type { Clinic, Patient } from '@docmee/db'
import {
  summarizeConversation,
  suggestReplies,
  suggestNextStep,
  searchKb,
  detectLanguage,
  type AssistantMessage,
  type Language,
} from '@docmee/agents'
import { claudeComplete, embedText } from '@docmee/llm'
import { withDb } from '../lib/db.js'
import { resolveClinicScope } from '../lib/scope.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

/** Language for the generated text: clinic-forced → patient's stored → detected. */
function resolveLanguage(
  clinic: Clinic,
  patient: Patient | null,
  messages: AssistantMessage[],
): Language {
  const forced = (clinic.settings as { botLanguage?: unknown }).botLanguage
  if (forced === 'es' || forced === 'en') return forced
  const stored = patient ? (patient.metadata as { language?: unknown }).language : undefined
  if (stored === 'en') return 'en'
  if (stored === 'es') return 'es'
  const lastInbound = [...messages].reverse().find((m) => m.role === 'user')
  return lastInbound ? detectLanguage(lastInbound.content) : 'es'
}

function clinicRulesText(clinic: Clinic): string | null {
  const raw = (clinic.settings as { clinicRules?: unknown }).clinicRules
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
}

const assistantRoute: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  // Shared loader: resolve scope, load the conversation, its messages, the patient
  // and the clinic. Returns null when the conversation is missing / out of scope.
  async function loadContext(clinicId: string, conversationId: string) {
    return withDb(async (sql) => {
      const convo = await createConversationsRepository(sql).findById(clinicId, conversationId)
      if (!convo) return null
      const rows = await createMessagesRepository(sql).listByConversation(clinicId, conversationId)
      const messages: AssistantMessage[] = rows.map((m) => ({ role: m.role, content: m.content }))
      const patient = convo.patientId
        ? await createPatientsRepository(sql).findById(clinicId, convo.patientId)
        : null
      const clinic = await createClinicsRepository(sql).findById(clinicId)
      return { messages, patient, clinic }
    })
  }

  // ── Summarize the conversation ──
  app.post<{ Params: { id: string } }>(
    '/:id/assist/summary',
    { preHandler: requireRole('secretary', 'doctor', 'clinic_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

      const ctx = await loadContext(clinicId, request.params.id)
      if (!ctx || !ctx.clinic) return reply.code(404).send({ error: 'Conversation not found' })

      const language = resolveLanguage(ctx.clinic, ctx.patient, ctx.messages)
      const result = await summarizeConversation(ctx.messages, language, {
        searchKb: async () => [],
        complete: claudeComplete,
      })
      return { summary: result.summary }
    },
  )

  // ── Suggest replies grounded in the clinic KB ──
  app.post<{ Params: { id: string } }>(
    '/:id/assist/suggestions',
    { preHandler: requireRole('secretary', 'doctor', 'clinic_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

      const ctx = await loadContext(clinicId, request.params.id)
      if (!ctx || !ctx.clinic) return reply.code(404).send({ error: 'Conversation not found' })

      const language = resolveLanguage(ctx.clinic, ctx.patient, ctx.messages)
      // Load the clinic's embedded KB chunks once and bind a clinic-scoped searcher.
      const chunks = await withDb((sql) =>
        createKnowledgeRepository(sql).listEmbeddedChunks(clinicId),
      )
      const result = await suggestReplies(
        {
          messages: ctx.messages,
          clinicName: ctx.clinic.name,
          rulesText: clinicRulesText(ctx.clinic),
          language,
        },
        {
          searchKb: (query) => searchKb(query, chunks, embedText),
          complete: claudeComplete,
        },
      )
      return { suggestions: result.suggestions, sources: result.sources }
    },
  )

  // ── Recommend the secretary's next operational step ──
  app.post<{ Params: { id: string } }>(
    '/:id/assist/next-step',
    { preHandler: requireRole('secretary', 'doctor', 'clinic_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

      const ctx = await loadContext(clinicId, request.params.id)
      if (!ctx || !ctx.clinic) return reply.code(404).send({ error: 'Conversation not found' })

      const language = resolveLanguage(ctx.clinic, ctx.patient, ctx.messages)
      const result = await suggestNextStep(ctx.messages, language, {
        searchKb: async () => [],
        complete: claudeComplete,
      })
      return { action: result.action, rationale: result.rationale }
    },
  )
}

export default assistantRoute
