'use client'

// IA Studio — License Management (P11). Per-clinic license status across the whole
// platform, with inline add/renew. Status is decoded by the API (display-only);
// per THE ONE RULE, nothing here ever interrupts a live clinic.
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/shared/api/client'
import { useClinics } from '@/shared/components/ClinicSelect'
import { LicenseBadge } from '@/shared/components/LicenseBadge'
import { useI18n } from '@/shared/hooks/useI18n'
import { formatDateTime } from '@/shared/format'
import type { Clinic, ClinicLicense } from '@/shared/types'

export default function LicensePage() {
  const { t } = useI18n()
  const { data, isLoading } = useClinics()
  const clinics = data?.clinics ?? []

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-xl font-bold">{t('license.title')}</h1>
      <p className="mb-4 text-xs text-gray-400">{t('license.never')}</p>

      {isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : clinics.length === 0 ? (
        <p className="text-sm text-gray-400">{t('studio.clinics.empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2">{t('license.clinic')}</th>
                <th className="px-3 py-2">{t('license.status')}</th>
                <th className="px-3 py-2">{t('license.seats')}</th>
                <th className="px-3 py-2">{t('license.expiresAt')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {clinics.map((c) => (
                <LicenseRow key={c.id} clinic={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LicenseRow({ clinic }: { clinic: Clinic }) {
  const { t, language } = useI18n()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['license', clinic.id],
    queryFn: () => api.get<{ license: ClinicLicense }>(`/clinics/${clinic.id}/license`),
  })
  const license = query.data?.license

  const save = useMutation({
    mutationFn: () => api.post(`/clinics/${clinic.id}/license`, { licenseKey: key.trim() }),
    onSuccess: () => {
      setKey('')
      setError(null)
      setEditing(false)
      qc.invalidateQueries({ queryKey: ['license', clinic.id] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : t('common.error')),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (key.trim()) save.mutate()
  }

  const hasLicense = license && license.state !== 'none'

  return (
    <>
      <tr className="border-t border-gray-100 dark:border-gray-800">
        <td className="px-3 py-2 font-medium">{clinic.name}</td>
        <td className="px-3 py-2">
          {query.isLoading ? (
            <span className="text-xs text-gray-400">{t('common.loading')}</span>
          ) : license ? (
            <LicenseBadge state={license.state} />
          ) : null}
        </td>
        <td className="px-3 py-2 text-gray-500">{license?.seats ?? '—'}</td>
        <td className="px-3 py-2 text-gray-500">
          {license?.expiresAt ? formatDateTime(license.expiresAt, language) : '—'}
        </td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {hasLicense ? t('license.renew') : t('license.add')}
          </button>
        </td>
      </tr>
      {editing && (
        <tr className="border-t border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
          <td colSpan={5} className="px-3 py-2">
            <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={t('license.keyPlaceholder')}
                className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
              <button
                type="submit"
                disabled={save.isPending || !key.trim()}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {t('license.add')}
              </button>
              {error && <span className="text-xs text-red-600">{error}</span>}
            </form>
          </td>
        </tr>
      )}
    </>
  )
}
