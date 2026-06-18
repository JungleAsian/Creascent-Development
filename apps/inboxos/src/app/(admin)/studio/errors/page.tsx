'use client'

// IA Studio — Error Review. Surfaces logged bot/runtime errors (error_reviews) per
// clinic so an operator can triage and mark them resolved.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { ClinicSelect } from '@/shared/components/ClinicSelect'
import { useI18n } from '@/shared/hooks/useI18n'
import { formatDateTime } from '@/shared/format'
import type { ErrorReview } from '@/shared/types'

export default function ErrorsPage() {
  const { t, language } = useI18n()
  const qc = useQueryClient()
  const [clinicId, setClinicId] = useState('')
  const [showResolved, setShowResolved] = useState(false)

  const key = ['errors', clinicId, showResolved]
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(clinicId),
    queryFn: () => {
      const qs = showResolved ? '' : '?status=open'
      return api.get<{ errors: ErrorReview[] }>(`/clinics/${clinicId}/errors${qs}`)
    },
  })

  const resolveMutation = useMutation({
    mutationFn: (errorId: string) => api.post(`/clinics/${clinicId}/errors/${errorId}/resolve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['errors', clinicId] }),
  })

  const errors = query.data?.errors ?? []

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('studio.errors.title')}</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
            />
            {t('studio.errors.showResolved')}
          </label>
          <ClinicSelect value={clinicId} onChange={setClinicId} label={t('studio.usage.selectClinic')} />
        </div>
      </div>

      {!clinicId ? (
        <p className="text-sm text-gray-400">{t('studio.errors.selectClinic')}</p>
      ) : query.isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
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
                {e.status === 'open' && (
                  <button
                    type="button"
                    onClick={() => resolveMutation.mutate(e.id)}
                    disabled={resolveMutation.isPending}
                    className="shrink-0 rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {t('studio.errors.resolve')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
