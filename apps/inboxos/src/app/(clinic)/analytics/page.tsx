'use client'

// Gap #39 — Advanced analytics. Available to clinic_admin and ia_studio_admin.
// Date range picker, headline metrics, a peak-hours heatmap, patient retention,
// bot effectiveness and a CSV export — no external charting library.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { useAuthStore } from '@/shared/store/auth'
import { useI18n } from '@/shared/hooks/useI18n'
import { useFeatures } from '@/shared/hooks/useFeatures'
import type { Clinic, AdvancedAnalytics } from '@/shared/types'

const DAY_MS = 24 * 60 * 60 * 1000
const isoDate = (d: Date) => d.toISOString().slice(0, 10)
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function AnalyticsPage() {
  const { t } = useI18n()
  const user = useAuthStore((s) => s.user)
  const { features, ready: featuresReady } = useFeatures()
  const isAdmin = user?.role === 'ia_studio_admin'
  const [clinicId, setClinicId] = useState<string>(user?.clinicId ?? '')
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 30 * DAY_MS)))
  const [to, setTo] = useState(isoDate(new Date()))

  const clinicsQuery = useQuery({
    queryKey: ['clinics'],
    enabled: isAdmin && features.advancedAnalytics,
    queryFn: () => api.get<{ clinics: Clinic[] }>('/clinics'),
  })

  const analyticsQuery = useQuery({
    queryKey: ['analytics', clinicId, from, to],
    enabled: Boolean(clinicId) && features.advancedAnalytics,
    queryFn: () =>
      api.get<{ analytics: AdvancedAnalytics }>(
        `/clinics/${clinicId}/analytics?from=${from}&to=${to}`,
      ),
  })
  const a = analyticsQuery.data?.analytics

  function exportCsv() {
    if (!a) return
    const lines = [
      ['Metric', 'Value'],
      ['Conversations', String(a.totalConversations)],
      ['Resolution rate', `${Math.round(a.resolutionRate * 100)}%`],
      ['Messages per conversation', String(a.avgConversationLength)],
      ['Handoff rate', `${Math.round(a.handoffRate * 100)}%`],
      ['Automation rate', `${Math.round(a.automationRate * 100)}%`],
      ['KB hit rate', `${Math.round(a.kbHitRate * 100)}%`],
      ['New patients', String(a.newPatients)],
      ['Returning patients', String(a.returningPatients)],
    ]
    const csv = lines.map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `analytics-${clinicId}-${from}_${to}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Req 40: the dashboard is gated behind the FEATURE_ADVANCED_ANALYTICS server flag.
  if (featuresReady && !features.advancedAnalytics) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <h1 className="text-xl font-bold">{t('analytics.title')}</h1>
        <p className="text-sm text-gray-400">{t('analytics.disabled')}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold">{t('analytics.title')}</h1>
        <div className="flex flex-wrap items-end gap-2">
          {isAdmin && (
            <label className="flex flex-col text-xs text-gray-500">
              {t('analytics.selectClinic')}
              <select
                value={clinicId}
                onChange={(e) => setClinicId(e.target.value)}
                className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <option value="">—</option>
                {(clinicsQuery.data?.clinics ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col text-xs text-gray-500">
            {t('analytics.from')}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            {t('analytics.to')}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
          </label>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!a}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {t('analytics.exportCsv')}
          </button>
        </div>
      </div>

      {!clinicId ? (
        <p className="text-sm text-gray-400">{t('analytics.empty')}</p>
      ) : analyticsQuery.isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : !a ? (
        <p className="text-sm text-gray-400">{t('common.empty')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card label={t('analytics.totalConversations')} value={String(a.totalConversations)} />
            <Card label={t('analytics.resolutionRate')} value={`${Math.round(a.resolutionRate * 100)}%`} />
            <Card label={t('analytics.avgLength')} value={String(a.avgConversationLength)} />
            <Card label={t('analytics.handoffRate')} value={`${Math.round(a.handoffRate * 100)}%`} />
            <Card label={t('analytics.automationRate')} value={`${Math.round(a.automationRate * 100)}%`} />
            <Card label={t('analytics.kbHitRate')} value={`${Math.round(a.kbHitRate * 100)}%`} />
            <Card label={t('analytics.newPatients')} value={String(a.newPatients)} />
            <Card label={t('analytics.returningPatients')} value={String(a.returningPatients)} />
          </div>

          <RetentionBar
            title={t('analytics.retention')}
            newPatients={a.newPatients}
            returning={a.returningPatients}
          />
          <Heatmap title={t('analytics.peakHours')} data={a.peakHours} empty={t('common.empty')} />
        </>
      )}
    </div>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}

function RetentionBar({
  title,
  newPatients,
  returning,
}: {
  title: string
  newPatients: number
  returning: number
}) {
  const total = newPatients + returning
  const newPct = total > 0 ? (newPatients / total) * 100 : 0
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {total === 0 ? (
        <p className="text-sm text-gray-400">—</p>
      ) : (
        <div className="space-y-2">
          <div className="flex h-6 overflow-hidden rounded">
            <div className="bg-indigo-500" style={{ width: `${newPct}%` }} />
            <div className="bg-emerald-500" style={{ width: `${100 - newPct}%` }} />
          </div>
          <div className="flex gap-4 text-xs text-gray-500">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-indigo-500" />{newPatients}</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500" />{returning}</span>
          </div>
        </div>
      )}
    </section>
  )
}

function Heatmap({
  title,
  data,
  empty,
}: {
  title: string
  data: AdvancedAnalytics['peakHours']
  empty: string
}) {
  const grid = useMemo(() => {
    const map = new Map<string, number>()
    let max = 0
    for (const cell of data) {
      map.set(`${cell.dayOfWeek}-${cell.hour}`, cell.count)
      if (cell.count > max) max = cell.count
    }
    return { map, max: Math.max(1, max) }
  }, [data])

  return (
    <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-gray-400">{empty}</p>
      ) : (
        <div className="inline-block">
          <div className="flex">
            <div className="w-10" />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="w-4 text-center text-[8px] text-gray-400">
                {h % 6 === 0 ? h : ''}
              </div>
            ))}
          </div>
          {WEEKDAYS.map((label, dow) => (
            <div key={dow} className="flex items-center">
              <div className="w-10 text-[10px] text-gray-500">{label}</div>
              {Array.from({ length: 24 }, (_, hour) => {
                const count = grid.map.get(`${dow}-${hour}`) ?? 0
                const intensity = count / grid.max
                return (
                  <div
                    key={hour}
                    title={`${label} ${hour}:00 — ${count}`}
                    className="m-px h-4 w-4 rounded-sm"
                    style={{
                      backgroundColor:
                        count === 0 ? 'rgba(99,102,241,0.06)' : `rgba(99,102,241,${0.15 + intensity * 0.85})`,
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
