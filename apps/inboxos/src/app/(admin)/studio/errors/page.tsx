'use client'

// IA Studio — Error Review (P11, Gap #18). Surfaces logged bot/runtime errors per
// clinic. Adds a type filter and a detail slide-over with fix guidance on top of
// the P09 list + resolve flow.
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { ClinicSelect } from '@/shared/components/ClinicSelect'
import { SlideOver } from '@/shared/components/SlideOver'
import { useI18n } from '@/shared/hooks/useI18n'
import { formatDateTime } from '@/shared/format'
import type { TranslationKey } from '@/shared/i18n'
import type { ErrorReview } from '@/shared/types'

// Map a free-form errorType to fix-guidance copy via substring heuristics.
function guidanceKey(errorType: string): TranslationKey {
  const v = errorType.toLowerCase()
  if (v.includes('unanswered')) return 'errors.guidance.unanswered'
  if (v.includes('bad_response') || v.includes('bad response')) return 'errors.guidance.badResponse'
  if (v.includes('timeout') || v.includes('llm') || v.includes('provider')) return 'errors.guidance.timeout'
  if (v.includes('calendar') || v.includes('oauth')) return 'errors.guidance.calendar'
  if (v.includes('whatsapp') || v.includes('template') || v.includes('meta')) return 'errors.guidance.whatsapp'
  if (v.includes('embed') || v.includes('kb') || v.includes('knowledge')) return 'errors.guidance.embedding'
  return 'errors.guidance.generic'
}

export default function ErrorsPage() {
  const { t, language } = useI18n()
  const qc = useQueryClient()
  const [clinicId, setClinicId] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<ErrorReview | null>(null)
  const [kbTitle, setKbTitle] = useState('')
  const [kbContent, setKbContent] = useState('')

  // Build the shared status + date-range query string for both the list and the
  // CSV export so they always reflect the same filters (Req 36).
  const filterQuery = useMemo(() => {
    const params = new URLSearchParams()
    if (!showResolved) params.set('status', 'open')
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const qs = params.toString()
    return qs ? `?${qs}` : ''
  }, [showResolved, from, to])

  // Pre-fill the Add-to-KB form from the selected error each time it opens: the
  // patient's question becomes the document title, leaving the answer for the
  // operator to write.
  useEffect(() => {
    setKbTitle(selected ? selected.errorMessage.slice(0, 120) : '')
    setKbContent('')
  }, [selected])

  const query = useQuery({
    queryKey: ['errors', clinicId, filterQuery],
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ errors: ErrorReview[] }>(`/clinics/${clinicId}/errors${filterQuery}`),
  })

  const resolveMutation = useMutation({
    mutationFn: (errorId: string) => api.post(`/clinics/${clinicId}/errors/${errorId}/resolve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['errors', clinicId] })
      setSelected(null)
    },
  })

  // Batch resolve (Req 36): resolve every checked error in one request.
  const batchResolveMutation = useMutation({
    mutationFn: (ids: string[]) =>
      api.post(`/clinics/${clinicId}/errors/batch-resolve`, { ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['errors', clinicId] })
      setChecked(new Set())
    },
  })

  // Add-to-KB (Req 29): create approved KB content from this error and resolve it.
  const addToKbMutation = useMutation({
    mutationFn: (vars: { errorId: string; title: string; content: string }) =>
      api.post(`/clinics/${clinicId}/errors/${vars.errorId}/add-to-kb`, {
        title: vars.title,
        content: vars.content,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['errors', clinicId] })
      setSelected(null)
    },
  })

  const allErrors = query.data?.errors ?? []
  const types = useMemo(
    () => Array.from(new Set(allErrors.map((e) => e.errorType))).sort(),
    [allErrors],
  )
  const errors = typeFilter ? allErrors.filter((e) => e.errorType === typeFilter) : allErrors

  // Only open errors can be batch-resolved; selection is scoped to the visible list.
  const resolvableIds = useMemo(
    () => errors.filter((e) => e.status === 'open').map((e) => e.id),
    [errors],
  )
  const checkedIds = useMemo(
    () => resolvableIds.filter((id) => checked.has(id)),
    [resolvableIds, checked],
  )
  const allChecked = resolvableIds.length > 0 && checkedIds.length === resolvableIds.length

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(resolvableIds))
  }

  function exportCsv() {
    void api.download(`/clinics/${clinicId}/errors/export.csv${filterQuery}`, `error-reviews-${clinicId}.csv`)
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('studio.errors.title')}</h1>
        <div className="flex flex-wrap items-center gap-3">
          {types.length > 0 && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
            >
              <option value="">{t('studio.errors.allTypes')}</option>
              {types.map((ty) => (
                <option key={ty} value={ty}>
                  {ty}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-1 text-xs text-gray-500">
            {t('studio.errors.from')}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-500">
            {t('studio.errors.to')}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
            />
            {t('studio.errors.showResolved')}
          </label>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!clinicId || errors.length === 0}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {t('studio.errors.export')}
          </button>
          <ClinicSelect value={clinicId} onChange={setClinicId} label={t('studio.usage.selectClinic')} />
        </div>
      </div>

      {/* Batch-resolve bar (Req 36): select-all + resolve every checked open error. */}
      {clinicId && resolvableIds.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-gray-800 dark:bg-gray-900/50">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={allChecked} onChange={toggleAll} />
            {allChecked ? t('studio.errors.clearSelection') : t('studio.errors.selectAll')}
          </label>
          <button
            type="button"
            onClick={() => batchResolveMutation.mutate(checkedIds)}
            disabled={checkedIds.length === 0 || batchResolveMutation.isPending}
            className="rounded-md bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {t('studio.errors.resolveSelected', { count: checkedIds.length })}
          </button>
        </div>
      )}

      {!clinicId ? (
        <p className="text-sm text-gray-400">{t('studio.errors.selectClinic')}</p>
      ) : query.isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : query.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {t('common.error')}{' '}
          <button type="button" onClick={() => query.refetch()} className="font-medium underline">
            {t('common.retry')}
          </button>
        </div>
      ) : errors.length === 0 ? (
        <p className="text-sm text-gray-400">{t('studio.errors.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {errors.map((e) => (
            <li
              key={e.id}
              className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  {e.status === 'open' && (
                    <input
                      type="checkbox"
                      checked={checked.has(e.id)}
                      onChange={() => toggleCheck(e.id)}
                      className="mt-1 shrink-0"
                      aria-label={t('studio.errors.resolve')}
                    />
                  )}
                  <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-red-700 dark:bg-red-950 dark:text-red-300">
                      {e.errorType}
                    </span>
                    <span className="text-xs text-gray-400">{formatDateTime(e.createdAt, language)}</span>
                    {e.status !== 'open' && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500 dark:bg-gray-800">
                        {e.status}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 break-words text-sm">{e.errorMessage}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(e)}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    {t('common.view')}
                  </button>
                  {e.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => resolveMutation.mutate(e.id)}
                      disabled={resolveMutation.isPending}
                      className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {t('studio.errors.resolve')}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SlideOver open={selected !== null} onClose={() => setSelected(null)} title={t('studio.errors.detail')}>
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-red-700 dark:bg-red-950 dark:text-red-300">
                {selected.errorType}
              </span>
              <span className="text-xs text-gray-400">{formatDateTime(selected.createdAt, language)}</span>
            </div>

            <p className="break-words font-medium">{selected.errorMessage}</p>

            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/50">
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                {t('studio.errors.guidance')}
              </p>
              <p className="mt-1 text-xs text-indigo-900 dark:text-indigo-200">{t(guidanceKey(selected.errorType))}</p>
            </div>

            {selected.stackTrace && (
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-500">{t('studio.errors.stackTrace')}</p>
                <pre className="max-h-48 overflow-auto rounded-md bg-gray-900 p-2 text-[11px] text-gray-100">
                  {selected.stackTrace}
                </pre>
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-semibold text-gray-500">{t('studio.errors.context')}</p>
              {selected.context && Object.keys(selected.context).length > 0 ? (
                <pre className="max-h-48 overflow-auto rounded-md bg-gray-100 p-2 text-[11px] dark:bg-gray-800">
                  {JSON.stringify(selected.context, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-gray-400">{t('studio.errors.noContext')}</p>
              )}
            </div>

            {/* Add-to-KB (Req 29): turn an unanswered question / bad response into
                approved clinic knowledge. The patient's question pre-fills the
                title; the operator writes the answer. Saving also resolves the error. */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                {t('studio.errors.addToKb')}
              </p>
              <p className="mt-0.5 text-[11px] text-emerald-900/80 dark:text-emerald-200/80">
                {t('studio.errors.addToKbHint')}
              </p>
              <input
                value={kbTitle}
                onChange={(e) => setKbTitle(e.target.value)}
                placeholder={t('studio.errors.kbTitle')}
                className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
              />
              <textarea
                value={kbContent}
                onChange={(e) => setKbContent(e.target.value)}
                placeholder={t('studio.errors.kbAnswer')}
                rows={4}
                className="mt-2 w-full resize-none rounded-md border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
              />
              <button
                type="button"
                onClick={() =>
                  addToKbMutation.mutate({
                    errorId: selected.id,
                    title: kbTitle.trim(),
                    content: kbContent.trim(),
                  })
                }
                disabled={addToKbMutation.isPending || !kbTitle.trim() || !kbContent.trim()}
                className="mt-2 w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {t('studio.errors.addToKbSubmit')}
              </button>
            </div>

            {selected.status === 'open' && (
              <button
                type="button"
                onClick={() => resolveMutation.mutate(selected.id)}
                disabled={resolveMutation.isPending}
                className="w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {t('studio.errors.resolve')}
              </button>
            )}
          </div>
        )}
      </SlideOver>
    </div>
  )
}
