'use client'

// IA Studio — Usage Dashboard (P11). Per-clinic operational stats + a real AI-cost
// section sourced from ai_usage_events (cost_usd + tokens), plus a platform-wide
// per-clinic spend breakdown.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { ClinicSelect } from '@/shared/components/ClinicSelect'
import { useI18n } from '@/shared/hooks/useI18n'
import type { ClinicStats, ClinicUsage, ClinicUsageRow } from '@/shared/types'

function formatUsd(value: number): string {
  return `$${value.toFixed(value !== 0 && value < 1 ? 4 : 2)}`
}

function formatNum(value: number): string {
  return value.toLocaleString('en-US')
}

export default function UsagePage() {
  const { t } = useI18n()
  const [clinicId, setClinicId] = useState('')

  const statsQuery = useQuery({
    queryKey: ['stats', clinicId],
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ stats: ClinicStats }>(`/clinics/${clinicId}/stats`),
  })

  const usageQuery = useQuery({
    queryKey: ['usage', clinicId],
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ usage: ClinicUsage }>(`/clinics/${clinicId}/usage`),
  })

  const breakdownQuery = useQuery({
    queryKey: ['usage-summary'],
    queryFn: () => api.get<{ clinics: ClinicUsageRow[] }>('/usage/summary'),
  })

  const stats = statsQuery.data?.stats
  const usage = usageQuery.data?.usage
  const breakdown = breakdownQuery.data?.clinics ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('studio.usage.title')}</h1>
        <ClinicSelect value={clinicId} onChange={setClinicId} label={t('studio.usage.selectClinic')} />
      </div>

      {!clinicId ? (
        <p className="text-sm text-gray-400">{t('studio.usage.selectClinic')}</p>
      ) : statsQuery.isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : stats ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label={t('studio.usage.activeConversations')} value={formatNum(stats.activeConversations)} />
          <StatCard label={t('studio.usage.totalPatients')} value={formatNum(stats.totalPatients)} />
          {typeof stats.activeClinics === 'number' && (
            <StatCard label={t('studio.usage.activeClinics')} value={formatNum(stats.activeClinics)} />
          )}
        </section>
      ) : null}

      {/* AI cost — real data from ai_usage_events */}
      {clinicId && (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">{t('studio.usage.cost.title')}</h2>
            <span className="text-xs text-gray-400">{t('studio.usage.cost.source')}</span>
          </div>
          {usageQuery.isLoading ? (
            <p className="text-sm text-gray-400">{t('common.loading')}</p>
          ) : !usage || usage.eventCount === 0 ? (
            <p className="text-sm text-gray-400">{t('studio.usage.cost.empty')}</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard label={t('studio.usage.cost.total')} value={formatUsd(usage.totalCostUsd)} />
                <StatCard label={t('studio.usage.cost.tokens')} value={formatNum(usage.totalTokens)} />
                <StatCard label={t('studio.usage.cost.events')} value={formatNum(usage.eventCount)} />
              </div>
              {usage.byModel.length > 0 && (
                <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900">
                      <tr>
                        <th className="px-3 py-2">{t('studio.usage.model')}</th>
                        <th className="px-3 py-2 text-right">{t('studio.usage.cost.total')}</th>
                        <th className="px-3 py-2 text-right">{t('studio.usage.cost.tokens')}</th>
                        <th className="px-3 py-2 text-right">{t('studio.usage.cost.events')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.byModel.map((m) => (
                        <tr key={m.model} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="px-3 py-2 font-medium">{m.model}</td>
                          <td className="px-3 py-2 text-right">{formatUsd(m.costUsd)}</td>
                          <td className="px-3 py-2 text-right">{formatNum(m.totalTokens)}</td>
                          <td className="px-3 py-2 text-right">{formatNum(m.eventCount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Per-clinic breakdown across the whole platform */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">{t('studio.usage.breakdown.title')}</h2>
        {breakdownQuery.isLoading ? (
          <p className="text-sm text-gray-400">{t('common.loading')}</p>
        ) : breakdown.length === 0 ? (
          <p className="text-sm text-gray-400">{t('common.empty')}</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900">
                <tr>
                  <th className="px-3 py-2">{t('studio.usage.selectClinic')}</th>
                  <th className="px-3 py-2 text-right">{t('studio.usage.cost.total')}</th>
                  <th className="px-3 py-2 text-right">{t('studio.usage.cost.tokens')}</th>
                  <th className="px-3 py-2 text-right">{t('studio.usage.cost.events')}</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((c) => (
                  <tr
                    key={c.clinicId}
                    className="cursor-pointer border-t border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
                    onClick={() => setClinicId(c.clinicId)}
                  >
                    <td className="px-3 py-2 font-medium">{c.clinicName}</td>
                    <td className="px-3 py-2 text-right">{formatUsd(c.totalCostUsd)}</td>
                    <td className="px-3 py-2 text-right">{formatNum(c.totalTokens)}</td>
                    <td className="px-3 py-2 text-right">{formatNum(c.eventCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-3xl font-bold">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{label}</p>
    </div>
  )
}
