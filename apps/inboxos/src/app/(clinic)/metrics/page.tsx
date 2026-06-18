'use client'

// Gap #27 — Basic metrics dashboard. Available to clinic_admin and ia_studio_admin.
// Cards (today's activity), a CSS bar chart of conversations per day (last 30 days)
// and an SVG pie of intent distribution — no external charting library.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { useAuthStore } from '@/shared/store/auth'
import { useI18n } from '@/shared/hooks/useI18n'
import type { Clinic, ClinicMetrics } from '@/shared/types'

const PIE_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444',
  '#06b6d4', '#a855f7', '#ec4899', '#84cc16',
]

export default function MetricsPage() {
  const { t } = useI18n()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'ia_studio_admin'
  const [clinicId, setClinicId] = useState<string>(user?.clinicId ?? '')

  // IA Studio admins can pick any clinic; clinic admins are scoped to their own.
  const clinicsQuery = useQuery({
    queryKey: ['clinics'],
    enabled: isAdmin,
    queryFn: () => api.get<{ clinics: Clinic[] }>('/clinics'),
  })

  const metricsQuery = useQuery({
    queryKey: ['metrics', clinicId],
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ metrics: ClinicMetrics }>(`/clinics/${clinicId}/metrics`),
  })
  const m = metricsQuery.data?.metrics

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('metrics.title')}</h1>
        {isAdmin && (
          <label className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">{t('metrics.selectClinic')}</span>
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

      {metricsQuery.isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : !m ? (
        <p className="text-sm text-gray-400">{t('metrics.empty')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card label={t('metrics.conversationsToday')} value={String(m.conversationsToday)} />
            <Card label={t('metrics.messagesToday')} value={String(m.messagesToday)} />
            <Card label={t('metrics.botReplyRate')} value={`${Math.round(m.botReplyRate * 100)}%`} />
            <Card label={t('metrics.avgResponse')} value={formatDuration(m.avgResponseSeconds)} />
          </div>

          <BarChart data={m.conversationsPerDay} title={t('metrics.perDay')} empty={t('metrics.noData')} />
          <IntentPie data={m.topIntents} title={t('metrics.topIntents')} empty={t('metrics.noData')} />
        </>
      )}
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—'
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s ? `${m}m ${s}s` : `${m}m`
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}

function BarChart({
  data,
  title,
  empty,
}: {
  data: Array<{ date: string; count: number }>
  title: string
  empty: string
}) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-gray-400">{empty}</p>
      ) : (
        <div className="flex h-40 items-end gap-0.5">
          {data.map((d) => (
            <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end">
              <div
                className="w-full rounded-t bg-indigo-500 transition-all group-hover:bg-indigo-600"
                style={{ height: `${(d.count / max) * 100}%` }}
              />
              <span className="pointer-events-none absolute -top-5 hidden rounded bg-gray-800 px-1 py-0.5 text-[10px] text-white group-hover:block">
                {d.date.slice(5)}: {d.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function IntentPie({
  data,
  title,
  empty,
}: {
  data: Array<{ intent: string; count: number }>
  title: string
  empty: string
}) {
  const total = data.reduce((sum, d) => sum + d.count, 0)
  let cumulative = 0
  const slices = data.map((d, i) => {
    const start = (cumulative / total) * 360
    cumulative += d.count
    const end = (cumulative / total) * 360
    return { ...d, path: arcPath(50, 50, 48, start, end), color: PIE_COLORS[i % PIE_COLORS.length] }
  })

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {total === 0 ? (
        <p className="text-sm text-gray-400">{empty}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <svg viewBox="0 0 100 100" className="h-40 w-40 shrink-0" role="img" aria-label={title}>
            {slices.length === 1 ? (
              <circle cx="50" cy="50" r="48" fill={slices[0]!.color} />
            ) : (
              slices.map((s) => <path key={s.intent} d={s.path} fill={s.color} />)
            )}
          </svg>
          <ul className="space-y-1 text-sm">
            {slices.map((s) => (
              <li key={s.intent} className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
                <span className="text-gray-700 dark:text-gray-200">{s.intent}</span>
                <span className="text-xs text-gray-400">
                  {s.count} ({Math.round((s.count / total) * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// SVG arc path for a pie slice between two angles (degrees, clockwise from 12 o'clock).
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const toXY = (angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }
  const [x1, y1] = toXY(startAngle)
  const [x2, y2] = toXY(endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
}
