'use client'

// Req 37 — Automatic reports. The "panel" delivery channel for the scheduled
// reports the reports worker generates (daily 08:00 / weekly Monday 09:00). Lists
// a clinic's past reports and opens the rendered report in a slide-over.
// clinic_admin and ia_studio_admin only.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { useAuthStore } from '@/shared/store/auth'
import { useI18n } from '@/shared/hooks/useI18n'
import type { Clinic, GeneratedReport, ReportSummary } from '@/shared/types'

export default function ReportsPage() {
  const { t } = useI18n()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'ia_studio_admin'
  const [clinicId, setClinicId] = useState<string>(user?.clinicId ?? '')
  const [openId, setOpenId] = useState<string | null>(null)

  const clinicsQuery = useQuery({
    queryKey: ['clinics'],
    enabled: isAdmin,
    queryFn: () => api.get<{ clinics: Clinic[] }>('/clinics'),
  })

  const reportsQuery = useQuery({
    queryKey: ['reports', clinicId],
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ reports: ReportSummary[] }>(`/clinics/${clinicId}/reports`),
  })
  const reports = reportsQuery.data?.reports ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-6 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('reports.title')}</h1>
          <p className="mt-1 text-xs text-gray-400">{t('reports.hint')}</p>
        </div>
        {isAdmin && (
          <label className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">{t('reports.selectClinic')}</span>
            <select
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
            >
              {(clinicsQuery.data?.clinics ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {reportsQuery.isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-gray-400">{t('reports.empty')}</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  r.type === 'weekly'
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                    : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                }`}
              >
                {t(`reports.type.${r.type}` as Parameters<typeof t>[0])}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-700 dark:text-gray-200">{r.subject}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {formatRange(r.periodStart, r.periodEnd)} · {t('reports.generated')} {formatDate(r.createdAt)}
                </p>
              </div>
              <span
                className={`shrink-0 text-[11px] ${
                  r.emailed ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'
                }`}
              >
                {r.emailed ? `✉ ${t('reports.emailed')}` : t('reports.notEmailed')}
              </span>
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs text-indigo-600 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                {t('reports.view')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {openId && clinicId && (
        <ReportViewer clinicId={clinicId} reportId={openId} onClose={() => setOpenId(null)} />
      )}
    </div>
  )
}

function ReportViewer({
  clinicId,
  reportId,
  onClose,
}: {
  clinicId: string
  reportId: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const query = useQuery({
    queryKey: ['report', clinicId, reportId],
    queryFn: () => api.get<{ report: GeneratedReport }>(`/clinics/${clinicId}/reports/${reportId}`),
  })
  const report = query.data?.report

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label={t('reports.close')} onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white p-6 shadow-xl dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{report?.subject ?? t('reports.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"
          >
            {t('reports.close')}
          </button>
        </div>
        {query.isLoading || !report ? (
          <p className="text-sm text-gray-400">{t('reports.loadingOne')}</p>
        ) : (
          <>
            <p className="mb-3 text-[11px] text-gray-400">
              {t('reports.recipient')}: {report.recipientEmail || t('reports.noRecipient')} ·{' '}
              {report.emailed ? t('reports.emailed') : t('reports.notEmailed')}
            </p>
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: report.html }}
            />
          </>
        )}
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—'
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`
}
