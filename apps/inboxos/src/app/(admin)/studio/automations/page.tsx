'use client'

// IA Studio — Automation & follow-ups (Screen 12 / Rev1 #14, #28, #38).
// The automation BUILDER: per-clinic follow-up automations with a schedule preview
// and WhatsApp 24-hour-window compliance warnings, review-request configuration with
// a patient-friendly message preview, and a compact view of the custom-flow library
// (full editor lives at /studio/custom-flows).
//
// The follow-up/review SCHEDULES are owned by the workers (apps/workers); this page
// configures clinic.settings.automations (which the workers honour at fire time) and
// clinic.settings.reviewLink (where the review-request worker points patients).
import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { ClinicSelect } from '@/shared/components/ClinicSelect'
import { useI18n } from '@/shared/hooks/useI18n'
import {
  AUTOMATION_DEFS,
  PROACTIVE_CAP_PER_DAY,
  readAutomations,
  isFollowUpEnabled,
  isReviewEnabled,
  activeCount,
  type AutomationDef,
  type ScheduleOffset,
  type AutomationsConfig,
} from '@/shared/automations'
import type { Clinic, ClinicSettings, CustomFlow } from '@/shared/types'

const field =
  'w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800'

type Translate = ReturnType<typeof useI18n>['t']

// ── Small toggle switch ──────────────────────────────────────────────────────────
function Toggle({
  on,
  disabled,
  onChange,
  label,
}: {
  on: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        on ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          on ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

// ── Schedule + compliance presentation helpers ────────────────────────────────────
function scheduleLabel(t: Translate, o: ScheduleOffset): string {
  const unitKey =
    o.unit === 'hour'
      ? o.amount === 1
        ? 'automations.unit.hour'
        : 'automations.unit.hours'
      : o.amount === 1
        ? 'automations.unit.day'
        : 'automations.unit.days'
  const unit = t(unitKey as Parameters<Translate>[0])
  if (o.anchor === 'silence') return t('automations.schedule.afterSilence', { amount: o.amount, unit })
  return t(
    o.direction === 'before' ? 'automations.schedule.before' : 'automations.schedule.after',
    { amount: o.amount, unit },
  )
}

function WindowBadge({ def }: { def: AutomationDef }) {
  const { t } = useI18n()
  const ok = def.window === 'template_fallback'
  return (
    <span
      title={t(`automations.window.${def.window}.hint` as Parameters<Translate>[0])}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        ok
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
      }`}
    >
      {ok ? '✓' : '⚠'} {t(`automations.window.${def.window}` as Parameters<Translate>[0])}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────────
export default function AutomationsPage() {
  const { t } = useI18n()
  const [clinicId, setClinicId] = useState('')

  const clinicQuery = useQuery({
    queryKey: ['clinic', clinicId],
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ clinic: Clinic }>(`/clinics/${clinicId}`),
  })

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('automations.title')}</h1>
        <ClinicSelect value={clinicId} onChange={setClinicId} label={t('analytics.selectClinic')} />
      </div>

      {!clinicId ? (
        <p className="text-sm text-gray-400">{t('automations.selectClinic')}</p>
      ) : clinicQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : clinicQuery.isError || !clinicQuery.data ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950">
          <p className="text-red-700 dark:text-red-300">{t('common.error')}</p>
          <button
            type="button"
            onClick={() => clinicQuery.refetch()}
            className="mt-2 rounded-md border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : (
        <AutomationSections clinic={clinicQuery.data.clinic} clinicId={clinicId} />
      )}
    </div>
  )
}

function AutomationSections({ clinic, clinicId }: { clinic: Clinic; clinicId: string }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const settings = clinic.settings as ClinicSettings
  const config = readAutomations(settings)

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/clinics/${clinicId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic', clinicId] })
      qc.invalidateQueries({ queryKey: ['clinics'] })
    },
  })

  /** Merge an automations patch onto the existing settings blob and persist. */
  function patchAutomations(next: AutomationsConfig) {
    save.mutate({ settings: { ...clinic.settings, automations: { ...config, ...next } } })
  }

  const { active, total } = activeCount(config)

  return (
    <div className="space-y-8">
      {save.isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {t('automations.saveError')}
        </p>
      )}

      {/* ── Section A: Follow-up automation (Req 14) ─────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t('automations.section.followUps')}</h2>
          <span className="text-xs text-gray-400">
            {t('automations.active', { active, total })}
            {save.isPending && <span className="ml-2">· {t('automations.saving')}</span>}
          </span>
        </div>
        <p className="mb-3 text-xs text-gray-500">{t('automations.section.followUps.desc')}</p>

        {/* 24h-window + anti-spam compliance note */}
        <div className="mb-3 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          {t('automations.windowNote', { cap: PROACTIVE_CAP_PER_DAY })}
        </div>

        <ul className="space-y-2">
          {AUTOMATION_DEFS.map((def) => {
            const on = isFollowUpEnabled(config, def.type)
            return (
              <li
                key={def.type}
                className={`rounded-lg border p-3 transition-colors ${
                  on
                    ? 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
                    : 'border-gray-200 bg-gray-50 opacity-70 dark:border-gray-800 dark:bg-gray-900/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t(`automations.type.${def.type}` as Parameters<Translate>[0])}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {t(`automations.type.${def.type}.desc` as Parameters<Translate>[0])}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        🕑 {scheduleLabel(t, def.offset)}
                      </span>
                      <WindowBadge def={def} />
                    </div>
                  </div>
                  <Toggle
                    on={on}
                    disabled={save.isPending}
                    label={t(`automations.type.${def.type}` as Parameters<Translate>[0])}
                    onChange={(next) =>
                      patchAutomations({ followUps: { ...config.followUps, [def.type]: next } })
                    }
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {/* ── Section B: Review requests (Req 38) ──────────────────────────────── */}
      <ReviewSection
        clinic={clinic}
        config={config}
        saving={save.isPending}
        onToggle={(enabled) => patchAutomations({ reviewRequest: { enabled } })}
        onSaveLink={(reviewLink) => save.mutate({ settings: { ...clinic.settings, reviewLink } })}
      />

      {/* ── Section C: Custom flows (Req 28) ─────────────────────────────────── */}
      <CustomFlowsSummary clinicId={clinicId} />
    </div>
  )
}

function ReviewSection({
  clinic,
  config,
  saving,
  onToggle,
  onSaveLink,
}: {
  clinic: Clinic
  config: AutomationsConfig
  saving: boolean
  onToggle: (enabled: boolean) => void
  onSaveLink: (link: string) => void
}) {
  const { t } = useI18n()
  const settings = clinic.settings as ClinicSettings
  const savedLink = settings.reviewLink ?? ''
  const [link, setLink] = useState(savedLink)
  const on = isReviewEnabled(config)
  const dirty = link.trim() !== savedLink

  const doctor = t('automations.review.sampleDoctor')
  const shown = (savedLink || t('automations.review.samplePlaceholder')) as string

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('automations.section.review')}</h2>
        <Toggle on={on} disabled={saving} label={t('automations.section.review')} onChange={onToggle} />
      </div>
      <p className="mb-3 text-xs text-gray-500">{t('automations.section.review.desc')}</p>

      <div
        className={`space-y-3 rounded-lg border p-3 ${
          on ? 'border-gray-200 dark:border-gray-800' : 'border-gray-200 opacity-70 dark:border-gray-800'
        }`}
      >
        <p className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          🕑 {t('automations.review.trigger')}
        </p>

        {/* No-link warning mirrors the worker, which skips when reviewLink is unset. */}
        {!savedLink && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            ⚠ {t('automations.review.noLink')}
          </p>
        )}

        <label className="block text-xs font-medium text-gray-500">
          {t('automations.review.linkLabel')}
          <div className="mt-1 flex gap-2">
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={t('automations.review.linkPlaceholder')}
              className={field}
            />
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => onSaveLink(link.trim())}
              className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {t('common.save')}
            </button>
          </div>
        </label>
        <p className="text-[11px] text-gray-400">{t('automations.review.linkHint')}</p>

        {/* Patient-friendly preview (the message the patient receives) — ES + EN. */}
        <div className="rounded-md bg-gray-50 p-2.5 dark:bg-gray-800/50">
          <p className="mb-1.5 text-[11px] font-medium text-gray-500">
            {t('automations.review.previewTitle')}
          </p>
          <div className="space-y-1.5">
            {(['es', 'en'] as const).map((lang) => (
              <div
                key={lang}
                className="rounded-lg rounded-bl-sm bg-emerald-100 px-2.5 py-1.5 text-xs text-gray-800 dark:bg-emerald-900/40 dark:text-gray-100"
              >
                <span className="mr-1 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                  {lang}
                </span>
                {lang === 'en'
                  ? `How was your experience with ${doctor}? Leave us your feedback: ${shown}`
                  : `¿Cómo fue tu experiencia con ${doctor}? Déjanos tu opinión: ${shown}`}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function CustomFlowsSummary({ clinicId }: { clinicId: string }) {
  const { t } = useI18n()
  const query = useQuery({
    queryKey: ['custom-flows', clinicId],
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ flows: CustomFlow[] }>(`/clinics/${clinicId}/custom-flows`),
  })
  const flows = query.data?.flows ?? []

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('automations.section.flows')}</h2>
        <Link
          href="/studio/custom-flows"
          className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {t('automations.flows.manage')}
        </Link>
      </div>
      <p className="mb-3 text-xs text-gray-500">{t('automations.section.flows.desc')}</p>

      {query.isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : query.isError ? (
        <button
          type="button"
          onClick={() => query.refetch()}
          className="rounded-md border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {t('common.retry')}
        </button>
      ) : flows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-400 dark:border-gray-700">
          {t('automations.flows.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {flows.map((flow) => (
            <li key={flow.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{flow.name}</p>
                <p className="truncate text-[11px] text-gray-500">
                  {t('automations.flows.keywords')}: {flow.triggerKeywords.join(', ') || '—'}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  flow.enabled
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                {flow.enabled ? t('automations.flows.on') : t('automations.flows.off')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}