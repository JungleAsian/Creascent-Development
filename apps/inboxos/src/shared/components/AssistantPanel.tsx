'use client'

// Req 41 — Internal AI Assistant for secretaries. A staff-only aid in the inbox
// right rail: summarize the conversation, or draft KB-grounded reply suggestions.
// Nothing here is sent to the patient — drafts are copied for the secretary to
// review, edit and send manually. The warning banner makes that explicit.
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import { useI18n } from '../hooks/useI18n'

interface SuggestionSource {
  title: string
  similarity: number
}
interface SuggestionsResponse {
  suggestions: string[]
  sources: SuggestionSource[]
}

export function AssistantPanel({ conversationId }: { conversationId: string }) {
  const { t } = useI18n()
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const summary = useMutation({
    mutationFn: () =>
      api.post<{ summary: string }>(`/conversations/${conversationId}/assist/summary`),
  })

  const suggestions = useMutation({
    mutationFn: () =>
      api.post<SuggestionsResponse>(`/conversations/${conversationId}/assist/suggestions`),
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

  function errorText(err: unknown): string {
    return err instanceof ApiError ? err.message : t('common.error')
  }

  return (
    <section className="border-b border-gray-200 p-3 dark:border-gray-800">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        ✨ {t('assistant.title')}
      </h3>

      <p className="mb-2 rounded-md bg-indigo-50 px-2 py-1.5 text-[11px] font-medium text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
        {t('assistant.warning')}
      </p>

      <div className="mb-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => summary.mutate()}
          disabled={summary.isPending}
          className="flex-1 rounded-md bg-gray-800 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-gray-900 disabled:opacity-60 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          {summary.isPending ? t('assistant.working') : t('assistant.summarize')}
        </button>
        <button
          type="button"
          onClick={() => suggestions.mutate()}
          disabled={suggestions.isPending}
          className="flex-1 rounded-md bg-indigo-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
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
                <button
                  type="button"
                  onClick={() => copy(s, idx)}
                  className="text-[10px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {copiedIdx === idx ? t('assistant.copied') : t('assistant.copy')}
                </button>
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
