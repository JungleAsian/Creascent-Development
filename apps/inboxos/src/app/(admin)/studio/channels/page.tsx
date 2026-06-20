'use client'

// Screen 10 — Channels & integrations. Pick a clinic, then see an at-a-glance health
// card for every channel/integration: connection state, concrete setup gaps, the
// webhook URL, and Meta token-expiry warnings (Req 19). Each card links into the
// matching section of the clinic detail page to fix things. WhatsApp is shown as an
// informational card because its config lives outside the clinic record.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { api, API_BASE } from '@/shared/api/client'
import { ClinicSelect } from '@/shared/components/ClinicSelect'
import { useI18n } from '@/shared/hooks/useI18n'
import {
  channelCards,
  type ServiceCard,
  type ServiceKey,
  type ServiceStatus,
} from '@/shared/channelStatus'
import type { TranslationKey } from '@/shared/i18n'
import type { Clinic } from '@/shared/types'

const SVC_NAME: Record<ServiceKey | 'whatsapp', TranslationKey> = {
  whatsapp: 'studio.channels.svc.whatsapp',
  messenger: 'studio.channels.svc.messenger',
  instagram: 'studio.channels.svc.instagram',
  calendar: 'studio.channels.svc.calendar',
  sheets: 'studio.channels.svc.sheets',
}
const SVC_DESC: Record<ServiceKey | 'whatsapp', TranslationKey> = {
  whatsapp: 'studio.channels.desc.whatsapp',
  messenger: 'studio.channels.desc.messenger',
  instagram: 'studio.channels.desc.instagram',
  calendar: 'studio.channels.desc.calendar',
  sheets: 'studio.channels.desc.sheets',
}
const SVC_TILE: Record<ServiceKey | 'whatsapp', string> = {
  whatsapp: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  messenger: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  instagram: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
  calendar: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  sheets: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
}
const STATUS_LABEL: Record<ServiceStatus, TranslationKey> = {
  connected: 'studio.channels.status.connected',
  expiring: 'studio.channels.status.expiring',
  expired: 'studio.channels.status.expired',
  pending: 'studio.channels.status.pending',
  disconnected: 'studio.channels.status.disconnected',
}
const STATUS_STYLE: Record<ServiceStatus, string> = {
  connected:
    'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  expiring:
    'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  expired: 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  pending:
    'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300',
  disconnected:
    'border-gray-300 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400',
}
const STATUS_DOT: Record<ServiceStatus, string> = {
  connected: 'bg-emerald-500',
  expiring: 'bg-amber-500',
  expired: 'bg-red-500',
  pending: 'bg-orange-500',
  disconnected: 'bg-gray-400',
}

export default function ChannelsPage() {
  const { t } = useI18n()
  const [clinicId, setClinicId] = useState('')

  const query = useQuery({
    queryKey: ['clinic', clinicId],
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ clinic: Clinic }>(`/clinics/${clinicId}`),
  })
  const clinic = query.data?.clinic

  // Date.now() is read once per render; channelStatus stays pure (now is passed in).
  const cards = useMemo<ServiceCard[]>(
    () => (clinic ? channelCards(clinic, { apiBase: API_BASE, now: Date.now() }) : []),
    [clinic],
  )
  const connectedCount = cards.filter((c) => c.status === 'connected').length

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('studio.channels.title')}</h1>
        <ClinicSelect value={clinicId} onChange={setClinicId} label={t('studio.usage.selectClinic')} />
      </div>
      <p className="mb-4 text-xs text-gray-400">{t('studio.channels.subtitle')}</p>

      {!clinicId ? (
        <p className="text-sm text-gray-400">{t('studio.kb.selectClinic')}</p>
      ) : query.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900"
            />
          ))}
        </div>
      ) : query.isError || !clinic ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {t('common.error')}{' '}
          <button type="button" onClick={() => query.refetch()} className="font-medium underline">
            {t('common.retry')}
          </button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium dark:bg-gray-800">
              {t('studio.channels.connectedSummary', { n: connectedCount, total: cards.length })}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cards.map((card) => (
              <ServiceCardView key={card.key} card={card} clinicId={clinicId} />
            ))}
            <WhatsAppCard />
          </div>
        </>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ServiceStatus }) {
  const { t } = useI18n()
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {t(STATUS_LABEL[status])}
    </span>
  )
}

function ServiceTile({ svc }: { svc: ServiceKey | 'whatsapp' }) {
  const { t } = useI18n()
  const name = t(SVC_NAME[svc])
  return (
    <span
      aria-hidden
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold ${SVC_TILE[svc]}`}
    >
      {name.charAt(0)}
    </span>
  )
}

function ServiceCardView({ card, clinicId }: { card: ServiceCard; clinicId: string }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start gap-2.5">
        <ServiceTile svc={card.key} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{t(SVC_NAME[card.key])}</p>
          <p className="truncate text-xs text-gray-400">{t(SVC_DESC[card.key])}</p>
        </div>
        <StatusBadge status={card.status} />
      </div>

      <div className="mt-2.5 flex-1 space-y-1.5 text-xs">
        {/* Validation issues — concrete setup gaps (permission / webhook token / id). */}
        {card.issues.length > 0 ? (
          <ul className="space-y-1">
            {card.issues.map((issue) => (
              <li key={issue} className="flex gap-1.5 text-orange-700 dark:text-orange-300">
                <span aria-hidden>⚠</span>
                <span>{t(`studio.channels.issue.${issue}` as TranslationKey)}</span>
              </li>
            ))}
          </ul>
        ) : card.status === 'connected' ? (
          <p className="text-emerald-600 dark:text-emerald-400">{t('studio.channels.allGood')}</p>
        ) : null}

        {/* Token expiry (Req 19) */}
        {card.tokenExpiry && (
          <p
            className={
              card.tokenExpiry.state === 'expired'
                ? 'text-red-600 dark:text-red-400'
                : card.tokenExpiry.state === 'expiring'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-gray-400'
            }
          >
            {card.tokenExpiry.state === 'expired'
              ? t('studio.channels.tokenExpiredOn', { date: card.tokenExpiry.date.slice(0, 10) })
              : card.tokenExpiry.state === 'expiring'
                ? t('studio.channels.tokenExpiresIn', {
                    n: card.tokenExpiry.daysLeft,
                    date: card.tokenExpiry.date.slice(0, 10),
                  })
                : t('studio.channels.tokenOk', { date: card.tokenExpiry.date.slice(0, 10) })}
          </p>
        )}

        {/* Webhook URL + copy */}
        {card.webhookUrl && <WebhookRow url={card.webhookUrl} />}
      </div>

      <div className="mt-2.5 border-t border-gray-100 pt-2 dark:border-gray-800">
        <Link
          href={`/studio/clinics/${clinicId}`}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
        >
          {t('studio.channels.configure')} →
        </Link>
      </div>
    </div>
  )
}

function WebhookRow({ url }: { url: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard may be unavailable (insecure context); silently no-op.
    }
  }
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[10px] font-medium uppercase text-gray-400">
        {t('studio.channels.webhook')}
      </span>
      <code className="min-w-0 flex-1 truncate rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded border border-gray-300 px-1.5 py-0.5 text-[10px] hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
      >
        {copied ? t('studio.channels.copied') : t('studio.channels.copy')}
      </button>
    </div>
  )
}

// WhatsApp is the primary channel but is provisioned at the platform level
// (channel_accounts), not per clinic in the panel — shown for completeness.
function WhatsAppCard() {
  const { t } = useI18n()
  return (
    <div className="flex flex-col rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
      <div className="flex items-start gap-2.5">
        <ServiceTile svc="whatsapp" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{t('studio.channels.svc.whatsapp')}</p>
          <p className="truncate text-xs text-gray-400">{t('studio.channels.desc.whatsapp')}</p>
        </div>
      </div>
      <p className="mt-2.5 flex-1 text-xs text-gray-400">{t('studio.channels.whatsappNote')}</p>
    </div>
  )
}
