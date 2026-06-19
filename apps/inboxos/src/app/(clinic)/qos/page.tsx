'use client'

// Req 32 — Quality of Service monitoring. Surfaces service-quality problems the
// basic metrics dashboard does not: upset patients, abandoned conversations,
// secretary vs bot response times, unclosed conversations and follow-up
// opportunities, plus an actionable "needs attention" list. clinic_admin and
// ia_studio_admin only. No external charting library.
import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { useAuthStore } from '@/shared/store/auth'
import { useI18n } from '@/shared/hooks/useI18n'
import type { Clinic, ClinicQos, QosAttentionItem } from '@/shared/types'

const STALE_OPTIONS = [6, 12, 24, 48, 72]

const REASON_STYLES: Record<QosAttentionItem['reason'], string> = {
  upset: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  abandoned: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  unclosed: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
}

export default function QosPage() {
  const { t } = useI18n()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'ia_studio_admin'
  const [clinicId, setClinicId] = useState<string>(user?.clinicId ?? '')
  const [staleHours, setStaleHours] = useState<number>(24)

  const clinicsQuery = useQuery({
    queryKey: ['clinics'],
    enabled: isAdmin,
    queryFn: () => api.get<{ clinics: Clinic[] }>('/clinics'),
  })

  const qosQuery = useQuery({
    queryKey: ['qos', clinicId, staleHours],
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ qos: ClinicQos }>(`/clinics/${clinicId}/qos?staleHours=${staleHours}`),
  })
  const q = qosQuery.data?.qos

  return (
    <div className="mx-auto max-w-4xl space-y-6 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('qos.title')}</h1>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <label className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">{t('qos.selectClinic')}</span>
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
          <label className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">{t('qos.staleHours')}</span>
            <select
              value={staleHours}
              onChange={(e) => setStaleHours(Number(e.target.value))}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
            >
              {STALE_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h}h
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {qosQuery.isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : !q ? (
        <p className="text-sm text-gray-400">{t('qos.empty')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Card
              label={t('qos.upsetPatients')}
              value={String(q.upsetPatients)}
              sub={`${q.upsetUnresolved} ${t('qos.upsetUnresolved')}`}
              tone={q.upsetUnresolved > 0 ? 'danger' : 'normal'}
            />
            <Card
              label={t('qos.abandoned')}
              value={String(q.abandonedConversations)}
              sub={t('qos.abandonedHint')}
              tone={q.abandonedConversations > 0 ? 'warn' : 'normal'}
            />
            <Card
              label={t('qos.unclosed')}
              value={String(q.unclosedConversations)}
              sub={`${q.unclosedAged} ${t('qos.unclosedAged')}`}
              tone={q.unclosedAged > 0 ? 'warn' : 'normal'}
            />
            <Card
              label={t('qos.followUps')}
              value={String(q.followUpOpportunities)}
              sub={t('qos.followUpsHint')}
            />
            <Card label={t('qos.pendingFollowUps')} value={String(q.pendingFollowUps)} />
          </div>

          <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-3 text-sm font-semibold">{t('qos.responseTimes')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <Card label={t('qos.botResponse')} value={formatDuration(q.avgBotResponseSeconds)} />
              <Card label={t('qos.secretaryResponse')} value={formatDuration(q.avgSecretaryResponseSeconds)} />
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-3 text-sm font-semibold">{t('qos.attention')}</h2>
            {q.attention.length === 0 ? (
              <p className="text-sm text-gray-400">{t('qos.attentionEmpty')}</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {q.attention.map((item) => (
                  <li key={item.conversationId} className="flex items-center gap-3 py-2 text-sm">
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${REASON_STYLES[item.reason]}`}
                    >
                      {t(`qos.reason.${item.reason}` as Parameters<typeof t>[0])}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200">
                      {item.patientName || t('qos.noName')}
                    </span>
                    <span className="hidden shrink-0 text-xs text-gray-400 sm:inline">{item.channel}</span>
                    <span className="shrink-0 text-xs text-gray-400">
                      {item.lastMessageAt ? relativeTime(item.lastMessageAt) : t('qos.never')}
                    </span>
                    <Link
                      href={`/inbox/${item.conversationId}/patient`}
                      className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs text-indigo-600 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                    >
                      {t('qos.open')}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Card({
  label,
  value,
  sub,
  tone = 'normal',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'normal' | 'warn' | 'danger'
}) {
  const valueColor =
    tone === 'danger' ? 'text-red-600 dark:text-red-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : ''
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueColor}`}>{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-gray-400">{sub}</p> : null}
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

// Compact relative time (e.g. "3h", "2d") for the last-activity column.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (diffMin < 60) return `${diffMin}m`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 48) return `${diffH}h`
  return `${Math.round(diffH / 24)}d`
}
