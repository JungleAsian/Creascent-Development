'use client'

// Gap #14 — Internal notes panel. Notes are clinic-internal and are NEVER sent to
// the patient — the warning banner makes that explicit at the point of entry.
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useI18n } from '../hooks/useI18n'
import { formatDateTime } from '../format'
import type { Note } from '../types'

export function NotesPanel({ conversationId }: { conversationId: string }) {
  const { t, language } = useI18n()
  const qc = useQueryClient()
  const key = ['notes', conversationId]
  const [draft, setDraft] = useState('')

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.get<{ notes: Note[] }>(`/conversations/${conversationId}/notes`),
  })

  const addMutation = useMutation({
    mutationFn: (content: string) => api.post(`/conversations/${conversationId}/notes`, { content }),
    onSuccess: () => {
      setDraft('')
      qc.invalidateQueries({ queryKey: key })
    },
  })

  const notes = query.data?.notes ?? []

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const content = draft.trim()
    if (content) addMutation.mutate(content)
  }

  return (
    <section className="border-b border-gray-200 p-3 dark:border-gray-800">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('notes.title')}</h3>

      <p className="mb-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
        {t('notes.warning')}
      </p>

      <div className="mb-2 space-y-2">
        {query.isLoading ? (
          <p className="text-xs text-gray-400">{t('common.loading')}</p>
        ) : notes.length === 0 ? (
          <p className="text-xs text-gray-400">{t('notes.empty')}</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-800">
              <p className="whitespace-pre-wrap break-words">{n.content}</p>
              <p className="mt-1 text-[10px] text-gray-400">{formatDateTime(n.createdAt, language)}</p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder={t('notes.placeholder')}
          className="w-full resize-none rounded-md border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-800"
        />
        <button
          type="submit"
          disabled={addMutation.isPending || !draft.trim()}
          className="w-full rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-900 disabled:opacity-60 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          {t('notes.add')}
        </button>
      </form>
    </section>
  )
}
