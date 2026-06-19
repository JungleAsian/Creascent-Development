'use client'

// Req 24 — Notification preferences. Lets a clinic user mute the EMAIL channel for
// non-urgent alert types (the bell feed always records everything; urgent p1 alerts
// always email and are shown here as "Always", non-mutable). Persists to
// PUT /user/notification-preferences.
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useI18n } from '../hooks/useI18n'
import {
  ALERT_TYPES,
  MUTABLE_ALERT_TYPES,
  alertLabelKey,
  alertPriority,
} from '../notifications'
import type { NotificationPrefs } from '../types'

const MUTABLE = new Set(MUTABLE_ALERT_TYPES)

export function NotificationPreferences() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const key = ['notification-prefs']

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.get<{ preferences: NotificationPrefs }>('/user/notification-preferences'),
  })

  const [emailEnabled, setEmailEnabled] = useState(true)
  const [muted, setMuted] = useState<Set<string>>(new Set())

  // Seed the form once the saved prefs load.
  useEffect(() => {
    const prefs = query.data?.preferences
    if (!prefs) return
    setEmailEnabled(prefs.emailEnabled)
    setMuted(new Set(prefs.mutedTypes))
  }, [query.data])

  const save = useMutation({
    mutationFn: (body: NotificationPrefs) => api.put('/user/notification-preferences', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  function toggleMuted(type: string) {
    setMuted((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  function onSave() {
    save.mutate({
      emailEnabled,
      // Only mutable (non-p1) types can be muted; never persist a p1 mute.
      mutedTypes: [...muted].filter((type) => MUTABLE.has(type)),
    })
  }

  if (query.isLoading) return <p className="text-sm text-gray-400">{t('common.loading')}</p>

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={emailEnabled}
          onChange={(e) => setEmailEnabled(e.target.checked)}
        />
        <span className="font-medium">{t('notif.prefs.emailEnabled')}</span>
      </label>
      <p className="text-xs text-gray-500 dark:text-gray-400">{t('notif.prefs.emailHint')}</p>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t('notif.prefs.emailFor')}
        </p>
        <ul className="space-y-1.5">
          {ALERT_TYPES.map((type) => {
            const mutable = MUTABLE.has(type)
            const urgent = alertPriority(type) === 'p1'
            return (
              <li key={type} className="flex items-center justify-between text-sm">
                <span className={urgent ? 'text-gray-500' : ''}>{t(alertLabelKey(type))}</span>
                {mutable ? (
                  <input
                    type="checkbox"
                    aria-label={t(alertLabelKey(type))}
                    disabled={!emailEnabled}
                    checked={emailEnabled && !muted.has(type)}
                    onChange={() => toggleMuted(type)}
                  />
                ) : (
                  <span className="text-xs text-gray-400">{t('notif.prefs.alwaysOn')}</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">{t('notif.prefs.urgentNote')}</p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={save.isPending}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {t('common.save')}
        </button>
        {save.isSuccess && <span className="text-xs text-green-600">{t('notif.prefs.saved')}</span>}
        {save.isError && <span className="text-xs text-red-600">{t('notif.prefs.saveError')}</span>}
      </div>
    </div>
  )
}
