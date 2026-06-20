'use client'

// Req 41 — Internal AI Assistant for secretaries. A staff-only aid in the inbox
// right rail with the four assistant pillars:
//   • Summarize   — catch up on a thread before taking over
//   • Suggest     — KB-grounded reply DRAFTS
//   • Next step   — the recommended operational action for the secretary
//   • Accept/edit — a draft is INSERTED into the composer to edit, never auto-sent
// Nothing here is sent to the patient — the warning banner makes that explicit, and
// "Insert into reply" only fills the editable draft for the human to review + send.
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import { useI18n } from '../hooks/useI18n'
import { useComposerStore } from '../store/composer'

// The fixed operational next-step vocabulary the API returns (mirrors
// packages/agents NEXT_STEP_ACTIONS). Kept local — inboxos doesn't depend on the
// agents package — and used to localize + colour-code the recommendation.
type NextStepAction =
  | 'urgent_safety'
  | 'escalate_human'
  | 'book_appointment'
  | 'confirm_details'
  | 'request_info'
  | 'answer_question'
  | 'follow_up_later'
  | 'resolve'

interface SuggestionSource {
  title: string
  similarity: number
}
interface SuggestionsResponse {
  suggestions: string[]
  sources: SuggestionSource[]
}
interface NextStepResponse {
  action: NextStepAction
  rationale: string
}

// Visual emphasis per recommended action. Safety + human-escalation are loud so a
// secretary can't miss them; the rest are calm violet. Keys map to assistant.action.*.
const ACTION_STYLE: Record<NextStepAction, { box: string; dot: string; icon: string }> = {
  urgent_safety: {
    box: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200',
    dot: 'bg-red-500',
    icon: '🚨',
  },
  escalate_human: {
    box: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
    dot: 'bg-amber-500',
    icon: '🙋',
  },
  book_appointment: {
    box: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200',
    dot: 'bg-violet-500',
    icon: '📅',
  },
  confirm_details: {
    box: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200',
    dot: 'bg-violet-500',
    icon: '✅',
  },
  request_info: {
    box: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200',
    dot: 'bg-violet-500',
    icon: '❓',
  },
  answer_question: {
    box: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200',
    dot: 'bg-violet-500',
    icon: '💬',
  },
  follow_up_later: {
    box: 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200',
    dot: 'bg-gray-400',
    icon: '⏳',
  },
  resolve: {
    box: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
    dot: 'bg-emerald-500',
    icon: '🏁',
  },
}

const ACTION_LABEL: Record<NextStepAction, `assistant.action.${NextStepAction}`> = {
  urgent_safety: 'assistant.action.urgent_safety',
  escalate_human: 'assistant.action.escalate_human',
  book_appointment: 'assistant.action.book_appointment',
  confirm_details: 'assistant.action.confirm_details',
  request_info: 'assistant.action.request_info',
  answer_question: 'assistant.action.answer_question',
  follow_up_later: 'assistant.action.follow_up_later',
  resolve: 'assistant.action.resolve',
}

export function AssistantPanel({ conversationId }: { conversationId: string }) {
  const { t } = useI18n()
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [insertedIdx, setInsertedIdx] = useState<number | null>(null)
  const requestInsert = useComposerStore((s) => s.requestInsert)

  const summary = useMutation({
    mutationFn: () =>
      api.post<{ summary: string }>(`/conversations/${conversationId}/assist/summary`),
  })

  const suggestions = useMutation({
    mutationFn: () =>
      api.post<SuggestionsResponse>(`/conversations/${conversationId}/assist/suggestions`),
  })

  const nextStep = useMutation({
    mutationFn: () =>
      api.post<NextStepResponse>(`/conversations/${conversationId}/assist/next-step`),
  })

  async function copy(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500)
    } catch {
      // Clipboard blocked — no-op; the text is still selectable on screen.
    }
  }

  // Accept boundary: push the draft into the composer for the secretary to edit and
  // send. Never sends here.
  function insert(text: string, idx: number) {
    requestInsert(conversationId, text)
    setInsertedIdx(idx)
    setTimeout(() => setInsertedIdx((cur) => (cur === idx ? null : cur)), 1500)
  }

  function errorText(err: unknown): string {
    return err instanceof ApiError ? err.message : t('common.error')
  }

  return (
    <section className="border-b border-gray-200 p-3 dark:border-gray-800">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        ✨ {t('assistant.title')}
      </h3>

      <p className="mb-2 rounded-md bg-violet-50 px-2 py-1.5 text-[11px] font-medium text-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
        {t('assistant.warning')}
      </p>

      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={() => summary.mutate()}
          disabled={summary.isPending}
          className="rounded-md bg-gray-800 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-gray-900 disabled:opacity-60 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          {summary.isPending ? t('assistant.working') : t('assistant.summarize')}
        </button>
        <button
          type="button"
          onClick={() => nextStep.mutate()}
          disabled={nextStep.isPending}
          className="rounded-md bg-gray-800 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-gray-900 disabled:opacity-60 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          {nextStep.isPending ? t('assistant.working') : t('assistant.nextStep')}
        </button>
        <button
          type="button"
          onClick={() => suggestions.mutate()}
          disabled={suggestions.isPending}
          className="rounded-md bg-violet-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {suggestions.isPending ? t('assistant.working') : t('assistant.suggest')}
        </button>
      </div>

      {/* Summary result */}
      {summary.isError ? (
        <p className="mb-2 text-[11px] text-red-600 dark:text-red-400">{errorText(summary.error)}</p>
      ) : null}
      {summary.data ? (
        <div className="mb-2 rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-800">
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-gray-400">
            {t('assistant.summaryLabel')}
          </p>
          <p className="whitespace-pre-wrap break-words">{summary.data.summary}</p>
        </div>
      ) : null}

      {/* Next-step result */}
      {nextStep.isError ? (
        <p className="mb-2 text-[11px] text-red-600 dark:text-red-400">{errorText(nextStep.error)}</p>
      ) : null}
      {nextStep.data ? (
        <div className={`mb-2 rounded-md border p-2 ${ACTION_STYLE[nextStep.data.action].box}`}>
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide opacity-70">
            {t('assistant.nextStepLabel')}
          </p>
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span aria-hidden>{ACTION_STYLE[nextStep.data.action].icon}</span>
            <span
              aria-hidden
              className={`inline-block h-2 w-2 rounded-full ${ACTION_STYLE[nextStep.data.action].dot}`}
            />
            <span>{t(ACTION_LABEL[nextStep.data.action])}</span>
          </div>
          {nextStep.data.rationale ? (
            <p className="mt-1 whitespace-pre-wrap break-words text-[11px] opacity-90">
              {nextStep.data.rationale}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Suggestion results */}
      {suggestions.isError ? (
        <p className="mb-2 text-[11px] text-red-600 dark:text-red-400">
          {errorText(suggestions.error)}
        </p>
      ) : null}
      {suggestions.data ? (
        suggestions.data.suggestions.length === 0 ? (
          <p className="text-[11px] text-gray-400">{t('assistant.noSuggestions')}</p>
        ) : (
          <div className="space-y-2">
            {suggestions.data.suggestions.map((s, idx) => (
              <div key={idx} className="rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-800">
                <p className="mb-1.5 whitespace-pre-wrap break-words">{s}</p>
                <div className="flex items-center gap-3">
                  {/* Accept boundary: insert into the composer to edit, then send. */}
                  <button
                    type="button"
                    onClick={() => insert(s, idx)}
                    className="text-[10px] font-semibold text-violet-600 hover:underline dark:text-violet-400"
                  >
                    {insertedIdx === idx ? t('assistant.inserted') : t('assistant.insert')}
                  </button>
                  <button
                    type="button"
                    onClick={() => copy(s, idx)}
                    className="text-[10px] font-medium text-gray-500 hover:underline dark:text-gray-400"
                  >
                    {copiedIdx === idx ? t('assistant.copied') : t('assistant.copy')}
                  </button>
                </div>
              </div>
            ))}
            {suggestions.data.sources.length > 0 ? (
              <p className="text-[10px] text-gray-400">
                {t('assistant.basedOn')}: {suggestions.data.sources.map((src) => src.title).join(', ')}
              </p>
            ) : null}
          </div>
        )
      ) : null}
    </section>
  )
}
