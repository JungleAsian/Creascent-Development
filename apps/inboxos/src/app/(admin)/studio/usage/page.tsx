'use client'

// IA Studio — Usage Dashboard. Per-clinic operational stats (active conversations,
// total patients) plus the platform-wide active-clinic count (admin only).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { ClinicSelect } from '@/shared/components/ClinicSelect'
import { useI18n } from '@/shared/hooks/useI18n'
import type { ClinicStats } from '@/shared/types'

export default function UsagePage() {
  const { t } = useI18n()
  const [clinicId, setClinicId] = useState('')

  const query = useQuery({
    queryKey: ['stats', clinicId],
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ stats: ClinicStats }>(`/clinics/${clinicId}/stats`),
  })

  const stats = query.data?.stats

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('studio.usage.title')}</h1>
        <ClinicSelect value={clinicId} onChange={setClinicId} label={t('studio.usage.selectClinic')} />
      </div>

      {!clinicId ? (
        <p className="text-sm text-gray-400">{t('studio.usage.selectClinic')}</p>
      ) : query.isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label={t('studio.usage.activeConversations')} value={stats.activeConversations} />
          <StatCard label={t('studio.usage.totalPatients')} value={stats.totalPatients} />
          {typeof stats.activeClinics === 'number' && (
            <StatCard label={t('studio.usage.activeClinics')} value={stats.activeClinics} />
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-400">{t('common.empty')}</p>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-3xl font-bold">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{label}</p>
    </div>
  )
}
