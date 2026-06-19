// Internal AI Assistant for secretaries (Req 41).
//
// Pure, dependency-injected logic that helps a human secretary inside the Clinic
// Inbox by (a) SUMMARIZING a conversation and (b) DRAFTING reply suggestions
// grounded in the clinic Knowledge Base. This is a STAFF-ONLY aid: nothing here
// sends anything to the patient — the API route returns the text to the panel and
// the secretary reviews/edits/sends manually. Side effects (LLM completion, KB
// search) are injected, mirroring clinic-bot.ts, so this module stays trivially
// testable and free of provider dependencies.

import type { KbMatch } from '../botbase/kb-retriever.js'
import type { Language } from '../botbase/language-detector.js'

/** A single inbox message, in the shape the assistant reasons over. */
export interface AssistantMessage {
  role: 'user' | 'assistant' | 'agent' | 'system'
  content: string
}

export interface InboxAssistantDeps {
  /** Clinic-scoped KB retrieval (already bound to the clinic's chunk set). */
  searchKb: (query: string) => Promise<KbMatch[]>
  /** LLM completion (system, user, maxTokens) → text. */
  complete: (system: string, userMessage: string, maxTokens: number) => Promise<string>
}

export interface SummaryResult {
  summary: string
}

export interface SuggestionSource {
  title: string
  similarity: number
}

export interface SuggestionsResult {
  suggestions: string[]
  /** KB documents the suggestions were grounded in (for "based on" attribution). */
  sources: SuggestionSource[]
}

// Up to 3 drafts per request — enough choice without overwhelming the panel.
export const MAX_SUGGESTIONS = 3
// Delimiter the model is told to place between suggestions. A line of three tildes
// is unlikely to appear inside a natural reply, so splitting on it is robust.
const SUGGESTION_DELIM = '~~~'

function speakerLabel(role: AssistantMessage['role'], language: Language): string {
  if (language === 'es') {
    switch (role) {
      case 'user':
        return 'Paciente'
      case 'assistant':
        return 'Bot'
      case 'agent':
        return 'Personal'
      default:
        return 'Sistema'
    }
  }
  switch (role) {
    case 'user':
      return 'Patient'
    case 'assistant':
      return 'Bot'
    case 'agent':
      return 'Staff'
    default:
      return 'System'
  }
}

/** Render the message list as a labelled transcript for the LLM. */
export function renderTranscript(messages: AssistantMessage[], language: Language): string {
  return messages
    .filter((m) => m.content.trim() !== '')
    .map((m) => `${speakerLabel(m.role, language)}: ${m.content.trim()}`)
    .join('\n')
}

/**
 * The most recent inbound patient message — the natural query for grounding reply
 * suggestions in the KB (what the secretary needs to answer right now). Returns
 * null when the patient has not said anything yet.
 */
export function lastPatientMessage(messages: AssistantMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m && m.role === 'user' && m.content.trim() !== '') return m.content.trim()
  }
  return null
}

function buildSummarySystemPrompt(language: Language): string {
  return [
    'You are an internal assistant for a medical clinic, helping a human secretary.',
    'Summarize the following patient conversation for the secretary so they can take over quickly.',
    'Cover: who the patient is (if known), what they want, any appointment details, and the next action the secretary should consider.',
    'Be concise — a few short sentences or bullet points. This summary is for STAFF ONLY and is never shown to the patient.',
    `Write the summary ONLY in ${language === 'es' ? 'Spanish' : 'English'}.`,
  ].join('\n')
}

function buildSuggestionsSystemPrompt(
  clinicName: string,
  rulesText: string | null,
  kbMatches: KbMatch[],
  language: Language,
): string {
  const kbContext = kbMatches.length
    ? kbMatches.map((m) => `# ${m.title}\n${m.content}`).join('\n\n')
    : ''

  return [
    `You are an internal drafting assistant for ${clinicName}, helping a human secretary reply to a patient.`,
    `Propose up to ${MAX_SUGGESTIONS} alternative reply drafts the secretary can review, edit and send.`,
    'Ground every draft strictly in the clinic knowledge base below; if the knowledge base does not cover the question, say you are not sure and suggest the secretary confirm — never invent clinic-specific facts.',
    rulesText
      ? `CLINIC-SPECIFIC RULES (always follow these):\n${rulesText}`
      : '',
    kbContext ? `Knowledge base:\n${kbContext}` : 'Knowledge base: (empty)',
    '',
    'CRITICAL MEDICAL SAFETY RULES (these drafts may be sent to a patient):',
    '- NEVER diagnose any condition',
    '- NEVER recommend or mention specific medications',
    '- NEVER provide dosage information',
    '- For symptoms: suggest the patient visit the clinic or call emergency services if urgent',
    '',
    `Write every draft ONLY in ${language === 'es' ? 'Spanish' : 'English'}.`,
    `Output ONLY the drafts, separated by a line containing exactly "${SUGGESTION_DELIM}". Do not number them or add any other commentary.`,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

/**
 * Split a raw LLM completion into individual reply drafts. Splits on the delimiter,
 * strips any stray leading numbering/bullets, drops blanks and caps the count. When
 * the model returned no delimiter (e.g. a single draft, or a stub response), the
 * whole trimmed text becomes one suggestion.
 */
export function parseSuggestions(raw: string): string[] {
  const parts = raw.includes(SUGGESTION_DELIM) ? raw.split(SUGGESTION_DELIM) : [raw]
  return parts
    .map((p) => p.trim().replace(/^(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter((p) => p !== '')
    .slice(0, MAX_SUGGESTIONS)
}

/** Summarize a conversation for the secretary. Never sent to the patient. */
export async function summarizeConversation(
  messages: AssistantMessage[],
  language: Language,
  deps: InboxAssistantDeps,
): Promise<SummaryResult> {
  const transcript = renderTranscript(messages, language)
  const system = buildSummarySystemPrompt(language)
  const user = transcript === '' ? '(no messages yet)' : transcript
  const summary = await deps.complete(system, user, 400)
  return { summary: summary.trim() }
}

export interface SuggestRepliesInput {
  messages: AssistantMessage[]
  clinicName: string
  rulesText: string | null
  language: Language
}

/**
 * Draft reply suggestions grounded in the clinic KB. The KB is searched with the
 * latest patient message; the drafts are returned to the panel for the secretary
 * to review/edit/send — they are NEVER sent automatically.
 */
export async function suggestReplies(
  input: SuggestRepliesInput,
  deps: InboxAssistantDeps,
): Promise<SuggestionsResult> {
  const query = lastPatientMessage(input.messages)
  const kbMatches = query ? await deps.searchKb(query) : []
  const system = buildSuggestionsSystemPrompt(
    input.clinicName,
    input.rulesText,
    kbMatches,
    input.language,
  )
  const user = renderTranscript(input.messages, input.language) || '(no messages yet)'
  const raw = await deps.complete(system, user, 600)
  return {
    suggestions: parseSuggestions(raw),
    sources: kbMatches.map((m) => ({ title: m.title, similarity: m.similarity })),
  }
}
