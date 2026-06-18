'use client'

// IA Studio — Compliance Checklist (P11). Tracks Meta WhatsApp submission progress.
// Progress is persisted in localStorage (per browser) — there is no global server
// settings store, and this is an operator-side tracker, not clinic data.
import { useEffect, useState } from 'react'
import { useI18n } from '@/shared/hooks/useI18n'
import type { TranslationKey } from '@/shared/i18n'

const STORAGE_KEY = 'docmee.compliance.v1'

// Order matches the P11 checklist spec.
const ITEMS: { id: string; label: TranslationKey }[] = [
  { id: 'privacy', label: 'compliance.item.privacy' },
  { id: 'waba', label: 'compliance.item.waba' },
  { id: 'tpl1Submitted', label: 'compliance.item.tpl1Submitted' },
  { id: 'tpl1Approved', label: 'compliance.item.tpl1Approved' },
  { id: 'tpl2Submitted', label: 'compliance.item.tpl2Submitted' },
  { id: 'tpl2Approved', label: 'compliance.item.tpl2Approved' },
  { id: 'tpl3Submitted', label: 'compliance.item.tpl3Submitted' },
  { id: 'tpl3Approved', label: 'compliance.item.tpl3Approved' },
  { id: 'firstClinic', label: 'compliance.item.firstClinic' },
  { id: 'acceptance', label: 'compliance.item.acceptance' },
]

export default function CompliancePage() {
  const { t } = useI18n()
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  // Load persisted progress after mount (avoids SSR/hydration mismatch).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) setChecked(JSON.parse(raw) as Record<string, boolean>)
    } catch {
      // ignore malformed storage
    }
  }, [])

  function persist(next: Record<string, boolean>) {
    setChecked(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // best-effort
    }
  }

  function toggle(id: string) {
    persist({ ...checked, [id]: !checked[id] })
  }

  const done = ITEMS.filter((i) => checked[i.id]).length
  const pct = Math.round((done / ITEMS.length) * 100)

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-3 text-xl font-bold">{t('compliance.title')}</h1>

      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        {t('compliance.banner')}
      </div>

      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
          <span>{t('compliance.progress', { done, total: ITEMS.length })}</span>
          <button
            type="button"
            onClick={() => persist({})}
            className="rounded-md border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {t('compliance.reset')}
          </button>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ul className="space-y-1.5">
        {ITEMS.map((item) => {
          const isChecked = Boolean(checked[item.id])
          return (
            <li key={item.id}>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                  isChecked
                    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'
                    : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(item.id)}
                  className="h-4 w-4"
                />
                <span className={isChecked ? 'text-gray-500 line-through' : ''}>{t(item.label)}</span>
              </label>
            </li>
          )
        })}
      </ul>

      <p className="mt-4 text-xs text-gray-400">{t('compliance.savedLocally')}</p>
    </div>
  )
}
