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
import { assessSafety, safetyRank, type SafetyLevel } from '../safety'
import { filterConversations, type ChannelFilter } from '../conversationFilter'
import type { Channel, Conversation, ConversationStatus } from '../types'

// Req 20: row treatment per safety severity — a coloured left rail + a badge so an
// emergency or urgent thread is unmistakable while scanning the queue, not buried
// in the tag panel. Critical = red, warning = amber.
const SAFETY_ROW: Record<SafetyLevel, { rail: string; badge: string; labelKey: 'safety.critical.list' | 'safety.warning.list' }> = {
  critical: {
    rail: 'border-l-4 border-l-red-600',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    labelKey: 'safety.critical.list',
  },
  warning: {
    rail: 'border-l-4 border-l-amber-500',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    labelKey: 'safety.warning.list',
  },
}

const STATUSES: ConversationStatus[] = [
  'open',
  'pending',
  'assigned',
  'handoff',
  'snoozed',
  'resolved',
  'archived',
]

// Channel indicator (Req 4): which platform the thread arrived on. Channel names
// are proper nouns, so the label is language-neutral (no i18n key needed).
const CHANNEL_INDICATOR: Record<Channel, { label: string; icon: string; className: string }> = {
  whatsapp: { label: 'WhatsApp', icon: '🟢', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  messenger: { label: 'Messenger', icon: '🔵', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  instagram: { label: 'Instagram', icon: '🟣', className: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300' },
}

const STATUS_BADGE: Record<ConversationStatus, string> = {
  open: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  handoff: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  snoozed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  resolved: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  archived: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

// Assignee filter (Rev1 #35 — filter assigned work by user). 'all' = no filter,
// 'mine' = the current user, 'unassigned' = no assignee, any other value = a team
// member id. 'mine'/'all'/'unassigned' are reserved and never collide with a uuid.
type AssigneeFilter = 'all' | 'mine' | 'unassigned' | (string & {})

export function ConversationList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { t } = useI18n()
  const userId = useAuthStore((s) => s.user?.id)
  const role = useAuthStore((s) => s.user?.role)
  const members = useTeam()
  const [status, setStatus] = useState<ConversationStatus | 'all'>('all')
  // Req 2 — role-specific default view: a doctor lands on the threads assigned to
  // them (their own escalations), while secretaries/admins see the full queue.
  // Reserved values never collide with a uuid, so this is a pure UI default the
  // user can still change with the assignee picker.
  const [assignee, setAssignee] = useState<AssigneeFilter>(role === 'doctor' ? 'mine' : 'all')
  // Find-a-thread affordances (client-side over the loaded set — the list isn't
  // server-paginated): free-text search on the contact handle + a channel filter.
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState<ChannelFilter>('all')

  const query = useQuery({
    queryKey: ['conversations', status, assignee, userId],
    refetchInterval: 10_000,
    queryFn: () => {
      const params = new URLSearchParams()
      if (status !== 'all') params.set('status', status)
      // Resolve the assignee filter to the `assigned_to` query param the API expects.
      const assignedTo =
        assignee === 'all' ? null : assignee === 'mine' ? (userId ?? null) : assignee
      if (assignedTo) params.set('assigned_to', assignedTo)
      const qs = params.toString()
      return api.get<{ conversations: Conversation[] }>(`/conversations${qs ? `?${qs}` : ''}`)
    },
  })

  const allRows = query.data?.conversations ?? []
  const filtersActive = search.trim() !== '' || channel !== 'all'

  // Apply the search/channel filter, then float safety-critical / urgent threads to
  // the top of the queue (stable within each severity band, so recency order is
  // preserved otherwise) — Req 20.
  const conversations = useMemo(() => {
    return filterConversations(allRows, search, channel)
      .map((c, i) => ({ c, i, rank: safetyRank(assessSafety(c.tags).level) }))
      .sort((a, b) => b.rank - a.rank || a.i - b.i)
      .map((x) => x.c)
  }, [allRows, search, channel])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 p-3 dark:border-gray-800">
        <h2 className="mb-2 text-sm font-semibold">{t('conv.title')}</h2>
        {/* Find a thread by patient handle (client-side over the loaded set). */}
        <div className="relative mb-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('conv.search')}
            aria-label={t('conv.search')}
            className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-800"
          />
        </div>
        {/* Channel filter (Req 4) — narrow the queue to one platform. */}
        <div className="mb-2 flex flex-wrap gap-1">
          <FilterChip active={channel === 'all'} onClick={() => setChannel('all')}>
            {t('conv.filter.allChannels')}
          </FilterChip>
          {(Object.keys(CHANNEL_INDICATOR) as Channel[]).map((ch) => (
            <FilterChip key={ch} active={channel === ch} onClick={() => setChannel(ch)}>
              {CHANNEL_INDICATOR[ch].icon} {CHANNEL_INDICATOR[ch].label}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <FilterChip active={status === 'all'} onClick={() => setStatus('all')}>
            {t('conv.filter.all')}
          </FilterChip>
          {STATUSES.map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
              {t(`conv.status.${s}` as const)}
            </FilterChip>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-1.5 text-xs">
          <span className="text-gray-500">{t('conv.filter.assignee')}:</span>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value as AssigneeFilter)}
            className="min-w-0 flex-1 truncate rounded-md border border-gray-300 px-2 py-1 text-xs outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="all">{t('conv.filter.allAssignees')}</option>
            <option value="mine">{t('conv.filter.mine')}</option>
            <option value="unassigned">{t('conv.unassigned')}</option>
            {members
              .filter((m) => m.id !== userId)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName ?? m.email}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="flex-1 overflow-y-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-gray-400">{t('common.loading')}</p>
        ) : conversations.length === 0 ? (
          filtersActive ? (
            <div className="p-4 text-sm text-gray-400">
              <p>{t('conv.noMatch')}</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setChannel('all')
                }}
                className="mt-2 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                {t('conv.clearFilters')}
              </button>
            </div>
          ) : (
            <p className="p-4 text-sm text-gray-400">{t('conv.empty')}</p>
          )
        ) : (
          <ul>
            {conversations.map((c) => {
              const safety = assessSafety(c.tags).level
              const row = safety ? SAFETY_ROW[safety] : null
              return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={`flex w-full flex-col gap-1 border-b border-gray-100 px-3 py-2.5 text-left hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 ${
                    row ? row.rail : ''
                  } ${selectedId === c.id ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.channelContactHandle}</span>
                    <span className="shrink-0 text-xs text-gray-400">{relativeTime(c.lastMessageAt)}</span>
                  </div>
                  {row && (
                    <span
                      className={`inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${row.badge}`}
                    >
                      ⚠ {t(row.labelKey)}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CHANNEL_INDICATOR[c.channel].className}`}
                      title={CHANNEL_INDICATOR[c.channel].label}
                    >
                      {CHANNEL_INDICATOR[c.channel].icon} {CHANNEL_INDICATOR[c.channel].label}
                    </span>
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
              )
            })}
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
