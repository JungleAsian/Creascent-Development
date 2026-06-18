'use client'

// Conversation list (left column). TanStack Query with a 10s refetch so the
// secretary sees new inbound messages without a manual refresh. Supports a status
// filter and a "mine" toggle (assigned_to = current user).
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import { useI18n } from '../hooks/useI18n'
import { useTeam } from '../hooks/useTeam'
import { relativeTime } from '../format'
import type { Conversation, ConversationStatus } from '../types'

const STATUSES: ConversationStatus[] = ['open', 'assigned', 'handoff', 'resolved']

const STATUS_BADGE: Record<ConversationStatus, string> = {
  open: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  handoff: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  resolved: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

export function ConversationList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { t } = useI18n()
  const userId = useAuthStore((s) => s.user?.id)
  const members = useTeam()
  const [status, setStatus] = useState<ConversationStatus | 'all'>('all')
  const [mine, setMine] = useState(false)

  const query = useQuery({
    queryKey: ['conversations', status, mine, userId],
    refetchInterval: 10_000,
    queryFn: () => {
      const params = new URLSearchParams()
      if (status !== 'all') params.set('status', status)
      if (mine && userId) params.set('assigned_to', userId)
      const qs = params.toString()
      return api.get<{ conversations: Conversation[] }>(`/conversations${qs ? `?${qs}` : ''}`)
    },
  })

  const conversations = useMemo(() => query.data?.conversations ?? [], [query.data])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 p-3 dark:border-gray-800">
        <h2 className="mb-2 text-sm font-semibold">{t('conv.title')}</h2>
        <div className="flex flex-wrap gap-1">
          <FilterChip active={status === 'all'} onClick={() => setStatus('all')}>
            {t('conv.filter.all')}
          </FilterChip>
          {STATUSES.map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
              {t(`conv.status.${s}` as const)}
            </FilterChip>
          ))}
          <FilterChip active={mine} onClick={() => setMine((m) => !m)}>
            {t('conv.filter.mine')}
          </FilterChip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-gray-400">{t('common.loading')}</p>
        ) : conversations.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">{t('conv.empty')}</p>
        ) : (
          <ul>
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={`flex w-full flex-col gap-1 border-b border-gray-100 px-3 py-2.5 text-left hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 ${
                    selectedId === c.id ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.channelContactHandle}</span>
                    <span className="shrink-0 text-xs text-gray-400">{relativeTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[c.status]}`}>
                      {t(`conv.status.${c.status}` as const)}
                    </span>
                    {c.assignedTo === userId ? (
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400">
                        {t('conv.assignedToMe')}
                      </span>
                    ) : c.assignedTo ? (
                      <span className="truncate text-[10px] text-gray-500">
                        {t('conv.assignedTo', {
                          name:
                            members.find((m) => m.id === c.assignedTo)?.fullName ??
                            members.find((m) => m.id === c.assignedTo)?.email ??
                            c.assignedTo,
                        })}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400">{t('conv.unassigned')}</span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs ${
        active
          ? 'bg-indigo-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  )
}
