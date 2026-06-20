'use client'

// IA Studio — Compliance Checklist (P11). Tracks Meta WhatsApp submission progress.
// Progress is persisted in localStorage (per browser) — there is no global server
// settings store, and this is an operator-side tracker, not clinic data.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/shared/hooks/useI18n'
import { LanguageToggle } from '@/shared/components/LanguageToggle'
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
  { id: 'discord', label: 'compliance.item.discord' },
  { id: 'vpsMonitoring', label: 'compliance.item.vpsMonitoring' },
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
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-xl font-bold">{t('compliance.pageTitle')}</h1>

      {/* Panel language switching (Req 21) — per-user, distinct from the bot language. */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-2 text-sm font-semibold">{t('compliance.section.language')}</h2>
        <LanguageToggle />
        <p className="mt-2 text-xs text-gray-400">{t('compliance.lang.hint')}</p>
      </section>

      {/* Compliance posture (Req 19/21) — the guarantees enforced automatically. */}
      <section>
        <h2 className="mb-1 text-sm font-semibold">{t('compliance.section.posture')}</h2>
        <p className="mb-3 text-xs text-gray-400">{t('compliance.posture.hint')}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PostureCard titleKey="compliance.posture.consent.title" bodyKey="compliance.posture.consent.body" />
          <PostureCard titleKey="compliance.posture.stop.title" bodyKey="compliance.posture.stop.body" />
          <PostureCard
            titleKey="compliance.posture.token.title"
            bodyKey="compliance.posture.token.body"
            linkHref="/studio/channels"
            linkKey="compliance.posture.token.link"
          />
          <PostureCard
            titleKey="compliance.posture.templates.title"
            bodyKey="compliance.posture.templates.body"
            linkHref="/studio/templates"
            linkKey="compliance.posture.templates.link"
          />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-3 text-sm font-semibold">{t('compliance.section.checklist')}</h2>

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

      <a
        href="/privacy-policy.html"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        {t('compliance.viewPolicy')}
      </a>

      <p className="mt-3 text-xs text-gray-400">{t('compliance.savedLocally')}</p>
      </section>
    </div>
  )
}

// One compliance-guarantee card: an "Automatic" pill, a title + explanation, and an
// optional deep-link to the live screen where the related data lives.
function PostureCard({
  titleKey,
  bodyKey,
  linkHref,
  linkKey,
}: {
  titleKey: TranslationKey
  bodyKey: TranslationKey
  linkHref?: string
  linkKey?: TranslationKey
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="mb-1 flex items-center gap-2">
        <span aria-hidden className="text-emerald-600 dark:text-emerald-400">
          🛡
        </span>
        <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{t(titleKey)}</span>
        <span className="ml-auto rounded-full border border-emerald-400 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-700 dark:border-emerald-700 dark:text-emerald-300">
          {t('compliance.posture.automatic')}
        </span>
      </div>
      <p className="flex-1 text-xs text-emerald-900/80 dark:text-emerald-200/80">{t(bodyKey)}</p>
      {linkHref && linkKey && (
        <Link
          href={linkHref}
          className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
        >
          {t(linkKey)} →
        </Link>
      )}
    </div>
  )
}
