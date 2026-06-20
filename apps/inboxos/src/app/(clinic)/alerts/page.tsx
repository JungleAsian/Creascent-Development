'use client'

// Screen 11 — Alerts center. The full-page companion to the header notification
// bell: the same clinic feed (GET /notifications) but with a priority digest,
// priority + read/unread filters, urgent-first ordering, the alert body, a deep-link
// into the originating conversation, and acknowledge (one / all). Read/unread,
// priority routing, escalation (p1) and acknowledgment are all first-class here.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { useI18n } from '@/shared/hooks/useI18n'
import { useAuthStore } from '@/shared/store/auth'
import { formatDateTime } from '@/shared/format'
import { alertLabelKey, alertPriority, type AlertPriority } from '@/shared/notifications'
import type { TranslationKey } from '@/shared/i18n'
import type { NotificationEvent } from '@/shared/types'

const POLL_MS = 30_000

/** Delivered-but-unhandled alerts are unread (mirrors the bell). */
function isUnread(n: NotificationEvent): boolean {
  return n.status !== 'acknowledged' && n.status !== 'skipped'
}

const PRIORITY_LABEL: Record<AlertPriority, TranslationKey> = {
  p1: 'alerts.priority.p1',
  p2: 'alerts.priority.p2',
  standard: 'alerts.priority.standard',
}
// Left rail + badge styling per priority — p1 (urgent) is unmistakable red.
const PRIORITY_RAIL: Record<AlertPriority, string> = {
  p1: 'border-l-red-500',
  p2: 'border-l-amber-500',
  standard: 'border-l-gray-300 dark:border-l-gray-700',
}
const PRIORITY_BADGE: Record<AlertPriority, string> = {
  p1: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  p2: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  standard: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}
const PRIORITY_RANK: Record<AlertPriority, number> = { p1: 2, p2: 1, standard: 0 }

type PriorityFilter = 'all' | AlertPriority

export default function AlertsPage() {
  const { t, language } = useI18n()
  const qc = useQueryClient()
  const clinicId = useAuthStore((s) => s.user?.clinicId)
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [unreadOnly, setUnreadOnly] = useState(false)

  const key = ['notifications', clinicId]
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(clinicId),
    refetchInterval: POLL_MS,
    queryFn: () => api.get<{ notifications: NotificationEvent[] }>(`/notifications?clinic_id=${clinicId}`),
  })
  const notifications = useMemo(() => query.data?.notifications ?? [], [query.data])
  const invalidate = () => qc.invalidateQueries({ queryKey: key })

  const acknowledge = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/acknowledge`),
    onSuccess: invalidate,
  })
  const unread = useMemo(() => notifications.filter(isUnread), [notifications])
  const markAllRead = useMutation({
    mutationFn: () => Promise.all(unread.map((n) => api.post(`/notifications/${n.id}/acknowledge`))),
    onSuccess: invalidate,
  })

  // Digest counts by priority + unread (Req 24 digest / urgent surfacing).
  const digest = useMemo(() => {
    const d = { p1: 0, p2: 0, standard: 0, unread: unread.length }
    for (const n of notifications) d[alertPriority(n.alertType)] += 1
    return d
  }, [notifications, unread.length])

  // Filter, then order: unread first, then by priority, then newest-first.
  const visible = useMemo(() => {
    const filtered = notifications.filter((n) => {
      if (priorityFilter !== 'all' && alertPriority(n.alertType) !== priorityFilter) return false
      if (unreadOnly && !isUnread(n)) return false
      return true
    })
    const rank = (n: NotificationEvent) =>
      (isUnread(n) ? 10 : 0) + PRIORITY_RANK[alertPriority(n.alertType)]
    return [...filtered].sort((a, b) => rank(b) - rank(a) || b.createdAt.localeCompare(a.createdAt))
  }, [notifications, priorityFilter, unreadOnly])

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto p-4 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('alerts.title')}</h1>
        {unread.length > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {t('notif.markAllRead')}
          </button>
        )}
      </div>
      <p className="mb-4 text-xs text-gray-400">{t('alerts.subtitle')}</p>

      {/* Digest — counts by priority + unread, doubling as the priority filter. */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <DigestChip
          label={t('alerts.digest.unread')}
          count={digest.unread}
          tone="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
          active={unreadOnly}
          onClick={() => setUnreadOnly((v) => !v)}
        />
        <DigestChip
          label={t('alerts.priority.p1')}
          count={digest.p1}
          tone="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
          active={priorityFilter === 'p1'}
          onClick={() => setPriorityFilter((p) => (p === 'p1' ? 'all' : 'p1'))}
        />
        <DigestChip
          label={t('alerts.priority.p2')}
          count={digest.p2}
          tone="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          active={priorityFilter === 'p2'}
          onClick={() => setPriorityFilter((p) => (p === 'p2' ? 'all' : 'p2'))}
        />
        <DigestChip
          label={t('alerts.priority.standard')}
          count={digest.standard}
          tone="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
          active={priorityFilter === 'standard'}
          onClick={() => setPriorityFilter((p) => (p === 'standard' ? 'all' : 'standard'))}
        />
      </div>

      {(priorityFilter !== 'all' || unreadOnly) && (
        <button
          type="button"
          onClick={() => {
            setPriorityFilter('all')
            setUnreadOnly(false)
          }}
          className="mb-3 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
        >
          {t('alerts.filter.all')}
        </button>
      )}

      {query.isLoading ? (
        <ul className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <li
              key={i}
              className="h-16 animate-pulse rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900"
            />
          ))}
        </ul>
      ) : query.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {t('notif.loadError')}{' '}
          <button type="button" onClick={() => query.refetch()} className="font-medium underline">
            {t('common.retry')}
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-400">
          {notifications.length === 0 ? t('notif.empty') : t('alerts.empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((n) => {
            const priority = alertPriority(n.alertType)
            const unreadRow = isUnread(n)
            return (
              <li
                key={n.id}
                className={`rounded-lg border border-l-4 border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 ${PRIORITY_RAIL[priority]} ${
                  unreadRow ? '' : 'opacity-70'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${PRIORITY_BADGE[priority]}`}
                      >
                        {t(PRIORITY_LABEL[priority])}
                      </span>
                      <span className="text-sm font-semibold">
                        {n.alertType ? t(alertLabelKey(n.alertType)) : (n.subject ?? '')}
                      </span>
                      {!unreadRow && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-400 dark:bg-gray-800">
                          {t('alerts.acknowledged')}
                        </span>
                      )}
                    </div>
                    {n.content && (
                      <p className="mt-1 break-words text-xs text-gray-600 dark:text-gray-300">{n.content}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <span className="text-xs text-gray-400">{formatDateTime(n.createdAt, language)}</span>
                      {n.conversationId && (
                        <Link
                          href={`/inbox?c=${n.conversationId}`}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                        >
                          {t('alerts.openConversation')}
                        </Link>
                      )}
                    </div>
                  </div>
                  {unreadRow && (
                    <button
                      type="button"
                      onClick={() => acknowledge.mutate(n.id)}
                      disabled={acknowledge.isPending}
                      className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
                    >
                      {t('notif.acknowledge')}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function DigestChip({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string
  count: number
  tone: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
        active ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200 dark:border-gray-800'
      } ${tone}`}
    >
      <span className="text-xs font-medium">{label}</span>
      <span className="text-lg font-bold tabular-nums">{count}</span>
    </button>
  )
}
