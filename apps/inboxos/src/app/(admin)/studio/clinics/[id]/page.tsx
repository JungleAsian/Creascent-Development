'use client'

// IA Studio — Clinic detail (P11). One clinic, edited across sections: general
// settings, bot configuration (tone + rules), business hours, Google Calendar
// connection, and license. Bot/hours live in clinic.settings; we always PATCH a
// MERGED settings object so unrelated keys are never dropped.
import { use, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, API_BASE } from '@/shared/api/client'
import { useI18n } from '@/shared/hooks/useI18n'
import { LicenseBadge } from '@/shared/components/LicenseBadge'
import { WEEKDAYS, toBusinessHours } from '@/shared/businessHours'
import { tonePreview, SAFETY_RULE_KEYS } from '@/shared/botPreview'
import {
  compileActiveRules,
  parseClinicRules,
  rulesChanged,
  type ClinicRule,
} from '@/shared/clinicRules'
import { formatDateTime } from '@/shared/format'
import type {
  BotLanguage,
  BotTone,
  BusinessHours,
  Clinic,
  ClinicLicense,
  ClinicPlan,
  ClinicSettings,
  ClinicStatus,
} from '@/shared/types'

const PLANS: ClinicPlan[] = ['starter', 'pro', 'enterprise']
const STATUSES: ClinicStatus[] = ['active', 'suspended', 'cancelled']
const TONES: BotTone[] = ['professional', 'friendly', 'brief']
const BOT_LANGUAGES: BotLanguage[] = ['auto', 'es', 'en']

export default function ClinicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useI18n()

  const query = useQuery({
    queryKey: ['clinic', id],
    queryFn: () => api.get<{ clinic: Clinic }>(`/clinics/${id}`),
  })
  const clinic = query.data?.clinic

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{clinic?.name ?? t('studio.clinics.detail')}</h1>
        <Link href="/studio/clinics" className="text-xs text-gray-500 hover:text-indigo-600">
          ← {t('nav.clinics')}
        </Link>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : !clinic ? (
        <p className="text-sm text-gray-400">{t('clinic.notFound')}</p>
      ) : (
        <>
          <GeneralSection clinic={clinic} />
          <BotConfigSection clinic={clinic} />
          <BusinessHoursSection clinic={clinic} />
          <CalendarSection clinic={clinic} />
          <SheetsSection clinic={clinic} />
          <MessengerSection clinic={clinic} />
          <InstagramSection clinic={clinic} />
          <LicenseSection clinicId={clinic.id} />
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

const inputCls =
  'rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800'

function useSaveClinic(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/clinics/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic', id] })
      qc.invalidateQueries({ queryKey: ['clinics'] })
    },
  })
}

function GeneralSection({ clinic }: { clinic: Clinic }) {
  const { t } = useI18n()
  const [name, setName] = useState(clinic.name)
  const [plan, setPlan] = useState<ClinicPlan>(clinic.plan)
  const [status, setStatus] = useState<ClinicStatus>(clinic.status)
  const [timezone, setTimezone] = useState(clinic.timezone)
  const save = useSaveClinic(clinic.id)

  const dirty =
    name !== clinic.name ||
    plan !== clinic.plan ||
    status !== clinic.status ||
    timezone !== clinic.timezone

  return (
    <Section title={t('clinic.section.general')}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('studio.clinics.name')}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`w-full ${inputCls}`} />
        </Field>
        <Field label={t('studio.clinics.slug')}>
          <input value={clinic.slug} disabled className={`w-full ${inputCls} opacity-60`} />
        </Field>
        <Field label={t('studio.clinics.plan')}>
          <select value={plan} onChange={(e) => setPlan(e.target.value as ClinicPlan)} className={`w-full ${inputCls}`}>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('studio.clinics.status')}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ClinicStatus)}
            className={`w-full ${inputCls}`}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('studio.clinics.timezone')}>
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} className={`w-full ${inputCls}`} />
        </Field>
      </div>
      <SaveBar
        dirty={dirty}
        pending={save.isPending}
        saved={save.isSuccess && !dirty}
        onSave={() => save.mutate({ name, plan, status, timezone })}
      />
    </Section>
  )
}

function BotConfigSection({ clinic }: { clinic: Clinic }) {
  const { t, language: panelLanguage } = useI18n()
  const settings = clinic.settings as ClinicSettings
  const [tone, setTone] = useState<BotTone>(settings.botTone ?? 'professional')
  const [language, setLanguage] = useState<BotLanguage>(settings.botLanguage ?? 'auto')
  // Clinic rules as a structured list with a per-rule active/inactive toggle
  // (Screen 8 brief). Compare against the freshly-parsed persisted list each render
  // so the section flips back to "saved" after the clinic refetches.
  const persistedRules = parseClinicRules(settings)
  const [rules, setRules] = useState<ClinicRule[]>(persistedRules)
  const save = useSaveClinic(clinic.id)
  // The preview reflects the BOT's configured language; on 'auto' it mirrors the
  // patient, so we show one example in the operator's panel language.
  const previewLanguage = language === 'auto' ? panelLanguage : language

  const dirty =
    tone !== (settings.botTone ?? 'professional') ||
    language !== (settings.botLanguage ?? 'auto') ||
    rulesChanged(rules, persistedRules)

  function updateRule(id: string, patch: Partial<ClinicRule>) {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function deleteRule(id: string) {
    setRules((rs) => rs.filter((r) => r.id !== id))
  }
  function addRule(text: string) {
    setRules((rs) => [...rs, { id: crypto.randomUUID(), text: text.trim(), active: true }])
  }

  function onSave() {
    save.mutate({
      settings: {
        ...clinic.settings,
        botTone: tone,
        botLanguage: language,
        // The bot reads the flat string; recompile it from the ACTIVE rules so an
        // inactive rule disappears from the prompt without losing its text.
        clinicRules: compileActiveRules(rules),
        clinicRulesList: rules,
      },
    })
  }

  return (
    <Section title={t('clinic.section.bot')}>
      <p className="mb-2 text-xs font-medium text-gray-500">{t('bot.tone.title')}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {TONES.map((value) => {
          const active = tone === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTone(value)}
              className={`rounded-lg border p-3 text-left ${
                active
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950'
                  : 'border-gray-200 hover:border-gray-300 dark:border-gray-800'
              }`}
            >
              <p className="text-sm font-semibold">{t(`bot.tone.${value}` as const)}</p>
              <p className="mt-1 text-xs text-gray-500">{t(`bot.tone.${value}Hint` as const)}</p>
            </button>
          )
        })}
      </div>

      {/* Live tone preview (Req 26/27) — a sample exchange in the selected tone + language. */}
      <TonePreviewCard tone={tone} language={previewLanguage} showAutoNote={language === 'auto'} />

      <div className="mt-4">
        <p className="mb-1 text-xs font-medium text-gray-500">{t('bot.language.title')}</p>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as BotLanguage)}
          className={inputCls}
        >
          {BOT_LANGUAGES.map((value) => (
            <option key={value} value={value}>
              {t(`bot.language.${value}` as const)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-400">{t('bot.language.hint')}</p>
      </div>

      {/* Non-removable safety rules (Req 20) — presented before the editable rules so
          it is unmistakable that these are always enforced on top of clinic rules. */}
      <SafetyRulesCard />

      {/* Clinic-rule editor (Req 27) — each rule toggles active/inactive; only active
          rules reach the bot. Sits below the always-on safety rules. */}
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-gray-500">{t('bot.rules.title')}</p>
          {rules.length > 0 && (
            <span className="text-[11px] text-gray-400">
              {t('bot.rules.activeCount', {
                active: rules.filter((r) => r.active).length,
                total: rules.length,
              })}
            </span>
          )}
        </div>
        <p className="mb-2 text-xs text-gray-400">{t('bot.rules.hint')}</p>

        {rules.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-400 dark:border-gray-700">
            {t('bot.rules.empty')}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onToggle={() => updateRule(rule.id, { active: !rule.active })}
                onChangeText={(text) => updateRule(rule.id, { text })}
                onDelete={() => deleteRule(rule.id)}
              />
            ))}
          </ul>
        )}

        <AddRuleForm onAdd={addRule} />
      </div>

      <SaveBar dirty={dirty} pending={save.isPending} saved={save.isSuccess && !dirty} onSave={onSave} />
    </Section>
  )
}

// Sample patient/bot exchange that re-renders as the tone or language changes.
function TonePreviewCard({
  tone,
  language,
  showAutoNote,
}: {
  tone: BotTone
  language: 'es' | 'en'
  showAutoNote: boolean
}) {
  const { t } = useI18n()
  const sample = tonePreview(tone, language)
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
      <p className="mb-2 text-xs font-medium text-gray-500">{t('bot.preview.title')}</p>
      <div className="space-y-1.5">
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-white px-3 py-1.5 text-sm shadow-sm dark:bg-gray-800">
            <span className="mb-0.5 block text-[10px] font-medium uppercase text-gray-400">
              {t('bot.preview.patient')}
            </span>
            {sample.patient}
          </div>
        </div>
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-indigo-600 px-3 py-1.5 text-sm text-white">
            <span className="mb-0.5 block text-[10px] font-medium uppercase text-indigo-200">
              {t('bot.preview.bot')}
            </span>
            {sample.bot}
          </div>
        </div>
      </div>
      {showAutoNote && <p className="mt-2 text-[11px] text-gray-400">{t('bot.preview.autoNote')}</p>}
    </div>
  )
}

// Read-only presentation of the always-enforced safety rules (Req 20). The enforcing
// logic lives in @docmee/agents (clinic-bot system prompt + outbound medical-safety
// screen); this card only states the guarantee and makes clear it cannot be removed.
function SafetyRulesCard() {
  const { t } = useI18n()
  return (
    <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden className="text-emerald-600 dark:text-emerald-400">
          🔒
        </span>
        <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          {t('bot.safety.title')}
        </span>
        <span className="rounded-full border border-emerald-400 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-700 dark:border-emerald-700 dark:text-emerald-300">
          {t('bot.safety.locked')}
        </span>
      </div>
      <ul className="space-y-1">
        {SAFETY_RULE_KEYS.map((key) => (
          <li key={key} className="flex gap-2 text-xs text-emerald-900 dark:text-emerald-200">
            <span aria-hidden className="text-emerald-500">
              ✓
            </span>
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
        {t('bot.safety.subtitle')}
      </p>
    </div>
  )
}

// One editable clinic rule with an active/inactive toggle. An inactive rule is dimmed
// and carries an "Inactive" badge — it stays in the list for later but is excluded
// from what the bot sees (compileActiveRules drops it on save).
function RuleRow({
  rule,
  onToggle,
  onChangeText,
  onDelete,
}: {
  rule: ClinicRule
  onToggle: () => void
  onChangeText: (text: string) => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(rule.text)

  function commit() {
    const next = draft.trim()
    if (next !== '' && next !== rule.text) onChangeText(next)
    else setDraft(rule.text)
    setEditing(false)
  }

  return (
    <li
      className={`flex items-start gap-2 rounded-lg border p-2 ${
        rule.active
          ? 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
          : 'border-gray-200 bg-gray-50 opacity-70 dark:border-gray-800 dark:bg-gray-950/40'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={rule.active}
        title={rule.active ? t('bot.rules.deactivate') : t('bot.rules.activate')}
        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
          rule.active
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
            : 'bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
        }`}
      >
        {rule.active ? t('bot.rules.active') : t('bot.rules.inactive')}
      </button>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft(rule.text)
              setEditing(false)
            }
          }}
          className={`min-w-0 flex-1 ${inputCls}`}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(rule.text)
            setEditing(true)
          }}
          className="min-w-0 flex-1 break-words text-left text-sm hover:text-indigo-600"
        >
          {rule.text}
        </button>
      )}

      <button
        type="button"
        onClick={onDelete}
        title={t('common.delete')}
        aria-label={t('common.delete')}
        className="mt-0.5 shrink-0 rounded-md border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
      >
        ✕
      </button>
    </li>
  )
}

// Add a new clinic rule to the list. New rules start active.
function AddRuleForm({ onAdd }: { onAdd: (text: string) => void }) {
  const { t } = useI18n()
  const [text, setText] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (text.trim()) {
      onAdd(text)
      setText('')
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('bot.rules.placeholder')}
        className={`min-w-0 flex-1 ${inputCls}`}
      />
      <button
        type="submit"
        disabled={!text.trim()}
        className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
      >
        {t('bot.rules.add')}
      </button>
    </form>
  )
}

function BusinessHoursSection({ clinic }: { clinic: Clinic }) {
  const { t } = useI18n()
  const settings = clinic.settings as ClinicSettings
  const [hours, setHours] = useState<BusinessHours>(() => toBusinessHours(settings.businessHours))
  const save = useSaveClinic(clinic.id)
  const [touched, setTouched] = useState(false)

  function update(day: string, patch: Partial<BusinessHours[string]>) {
    setTouched(true)
    setHours((h) => ({ ...h, [day]: { ...h[day]!, ...patch } }))
  }

  function onSave() {
    save.mutate({ settings: { ...clinic.settings, businessHours: hours } })
    setTouched(false)
  }

  return (
    <Section title={t('clinic.section.hours')}>
      <div className="space-y-1.5">
        {WEEKDAYS.map((day) => {
          const d = hours[day]!
          return (
            <div key={day} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-24 text-gray-600 dark:text-gray-400">{t(`hours.day.${day}` as const)}</span>
              <label className="flex items-center gap-1 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={Boolean(d.closed)}
                  onChange={(e) => update(day, { closed: e.target.checked })}
                />
                {t('hours.closed')}
              </label>
              <input
                type="time"
                value={d.open}
                disabled={d.closed}
                onChange={(e) => update(day, { open: e.target.value })}
                className={`${inputCls} disabled:opacity-40`}
              />
              <span className="text-gray-400">–</span>
              <input
                type="time"
                value={d.close}
                disabled={d.closed}
                onChange={(e) => update(day, { close: e.target.value })}
                className={`${inputCls} disabled:opacity-40`}
              />
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-gray-400">{t('hours.hint')}</p>
      <SaveBar
        dirty={touched}
        pending={save.isPending}
        saved={save.isSuccess && !touched}
        onSave={onSave}
      />
    </Section>
  )
}

function CalendarSection({ clinic }: { clinic: Clinic }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const settings = clinic.settings as ClinicSettings
  const connected = Boolean(settings.googleCalendar)
  // The API begins the OAuth flow with a redirect; open it in the same tab.
  const authUrl = `${API_BASE}/clinic/${clinic.id}/calendar/auth`

  // Disconnect drops the stored tokens server-side; re-read the clinic so the
  // badge flips back to "Not connected" and the bot stops booking.
  const disconnect = useMutation({
    mutationFn: () => api.del(`/clinic/${clinic.id}/calendar/disconnect`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic', clinic.id] })
      qc.invalidateQueries({ queryKey: ['clinics'] })
    },
  })

  return (
    <Section title={t('clinic.section.calendar')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            connected
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-gray-100 text-gray-500 dark:bg-gray-800'
          }`}
        >
          {connected ? t('calendar.connected') : t('calendar.notConnected')}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {connected && (
            <button
              type="button"
              disabled={disconnect.isPending}
              onClick={() => {
                if (window.confirm(t('calendar.disconnectConfirm'))) disconnect.mutate()
              }}
              className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
            >
              {disconnect.isPending ? t('calendar.disconnecting') : t('calendar.disconnect')}
            </button>
          )}
          <a
            href={authUrl}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            {connected ? t('calendar.reconnect') : t('calendar.connect')}
          </a>
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-400">{t('calendar.hint')}</p>
    </Section>
  )
}

function SheetsSection({ clinic }: { clinic: Clinic }) {
  const { t } = useI18n()
  const settings = clinic.settings as ClinicSettings
  const sheets = settings.googleSheets ?? {}
  const calendarConnected = Boolean(settings.googleCalendar)
  const [enabled, setEnabled] = useState(Boolean(sheets.enabled))
  const [spreadsheetId, setSpreadsheetId] = useState(sheets.spreadsheetId ?? '')
  const [sheetName, setSheetName] = useState(sheets.sheetName ?? '')
  const save = useSaveClinic(clinic.id)

  const dirty =
    enabled !== Boolean(sheets.enabled) ||
    spreadsheetId !== (sheets.spreadsheetId ?? '') ||
    sheetName !== (sheets.sheetName ?? '')

  function onSave() {
    save.mutate({
      settings: {
        ...clinic.settings,
        googleSheets: {
          ...sheets,
          enabled,
          spreadsheetId: spreadsheetId.trim(),
          sheetName: sheetName.trim(),
        },
      },
    })
  }

  return (
    <Section title={t('clinic.section.sheets')}>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {t('sheets.enable')}
      </label>
      <div className="mt-3 space-y-2">
        <Field label={t('sheets.spreadsheetId')}>
          <input
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
            placeholder="1AbC…xyz"
            className={`w-full ${inputCls}`}
          />
        </Field>
        <Field label={t('sheets.sheetName')}>
          <input
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            placeholder="CRM"
            className={`w-full ${inputCls}`}
          />
        </Field>
      </div>
      {!calendarConnected && <p className="mt-2 text-xs text-amber-600">{t('sheets.needsGoogle')}</p>}
      <p className="mt-2 text-xs text-gray-400">{t('sheets.hint')}</p>
      <SaveBar
        dirty={dirty}
        pending={save.isPending}
        saved={save.isSuccess && !dirty}
        onSave={onSave}
      />
    </Section>
  )
}

function MessengerSection({ clinic }: { clinic: Clinic }) {
  const { t } = useI18n()
  const settings = clinic.settings as ClinicSettings
  const [enabled, setEnabled] = useState(Boolean(clinic.messengerEnabled))
  const [pageId, setPageId] = useState(clinic.messengerPageId ?? '')
  const [verifyToken, setVerifyToken] = useState(clinic.messengerWebhookVerifyToken ?? '')
  const [token, setToken] = useState('') // write-only; empty keeps the stored token
  // Token-expiry date (Req 19) — drives the META_TOKEN_EXPIRING alert. Date inputs
  // use 'YYYY-MM-DD'; we keep just that day part of any stored ISO value.
  const [expiry, setExpiry] = useState((settings.messengerTokenExpiresAt ?? '').slice(0, 10))
  const [tested, setTested] = useState<boolean | null>(null)
  const save = useSaveClinic(clinic.id)

  const dirty =
    enabled !== Boolean(clinic.messengerEnabled) ||
    pageId !== (clinic.messengerPageId ?? '') ||
    verifyToken !== (clinic.messengerWebhookVerifyToken ?? '') ||
    expiry !== (settings.messengerTokenExpiresAt ?? '').slice(0, 10) ||
    token.trim() !== ''

  const webhookUrl = `${API_BASE}/webhook/messenger`

  function onSave() {
    const body: Record<string, unknown> = {
      messengerEnabled: enabled,
      messengerPageId: pageId.trim(),
      messengerWebhookVerifyToken: verifyToken.trim(),
      // Merge so unrelated settings keys are never dropped; clear when blanked.
      settings: { ...clinic.settings, messengerTokenExpiresAt: expiry || undefined },
    }
    // Only send the token when the admin typed a new one — empty preserves it.
    if (token.trim()) body.messengerPageAccessToken = token.trim()
    save.mutate(body, { onSuccess: () => setToken('') })
  }

  // Local readiness check — confirms the connection is fully configured.
  function onTest() {
    setTested(
      enabled &&
        pageId.trim() !== '' &&
        verifyToken.trim() !== '' &&
        (token.trim() !== '' || Boolean(clinic.messengerPageId)),
    )
  }

  return (
    <Section title={t('clinic.section.messenger')}>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span className="font-medium">{t('messenger.enable')}</span>
      </label>
      <p className="mb-3 text-xs text-gray-500">{t('messenger.enableHint')}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('messenger.pageId')}>
          <input value={pageId} onChange={(e) => setPageId(e.target.value)} className={`w-full ${inputCls}`} />
        </Field>
        <Field label={t('messenger.verifyToken')}>
          <input
            value={verifyToken}
            onChange={(e) => setVerifyToken(e.target.value)}
            className={`w-full ${inputCls}`}
          />
        </Field>
        <Field label={t('messenger.pageToken')}>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={clinic.messengerPageId ? '••••••••' : ''}
            className={`w-full ${inputCls}`}
          />
        </Field>
        <Field label={t('messenger.tokenExpiry')}>
          <input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className={`w-full ${inputCls}`}
          />
        </Field>
      </div>
      <p className="mt-1 text-xs text-gray-400">{t('messenger.pageTokenHint')}</p>
      <p className="mt-1 text-xs text-gray-400">{t('messenger.tokenExpiryHint')}</p>
      <p className="mt-1 text-xs text-gray-400">{t('messenger.hint', { url: webhookUrl })}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || save.isPending}
          className="rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-40 dark:bg-gray-700"
        >
          {save.isPending ? t('common.saving') : t('common.save')}
        </button>
        <button
          type="button"
          onClick={onTest}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold hover:border-gray-400 dark:border-gray-700"
        >
          {t('messenger.test')}
        </button>
        {tested === true && <span className="text-xs text-emerald-600">{t('messenger.testOk')}</span>}
        {tested === false && <span className="text-xs text-red-600">{t('messenger.testFail')}</span>}
        {save.isSuccess && !dirty && <span className="text-xs text-emerald-600">{t('common.saved')}</span>}
      </div>
    </Section>
  )
}

function InstagramSection({ clinic }: { clinic: Clinic }) {
  const { t } = useI18n()
  const settings = clinic.settings as ClinicSettings
  const [enabled, setEnabled] = useState(Boolean(clinic.instagramEnabled))
  const [accountId, setAccountId] = useState(clinic.instagramAccountId ?? '')
  const [verifyToken, setVerifyToken] = useState(clinic.instagramWebhookVerifyToken ?? '')
  const [token, setToken] = useState('') // write-only; empty keeps the stored token
  // Token-expiry date (Req 19) — drives the META_TOKEN_EXPIRING alert.
  const [expiry, setExpiry] = useState((settings.instagramTokenExpiresAt ?? '').slice(0, 10))
  const [tested, setTested] = useState<boolean | null>(null)
  const save = useSaveClinic(clinic.id)

  const dirty =
    enabled !== Boolean(clinic.instagramEnabled) ||
    accountId !== (clinic.instagramAccountId ?? '') ||
    verifyToken !== (clinic.instagramWebhookVerifyToken ?? '') ||
    expiry !== (settings.instagramTokenExpiresAt ?? '').slice(0, 10) ||
    token.trim() !== ''

  const webhookUrl = `${API_BASE}/webhook/instagram`

  function onSave() {
    const body: Record<string, unknown> = {
      instagramEnabled: enabled,
      instagramAccountId: accountId.trim(),
      instagramWebhookVerifyToken: verifyToken.trim(),
      // Merge so unrelated settings keys are never dropped; clear when blanked.
      settings: { ...clinic.settings, instagramTokenExpiresAt: expiry || undefined },
    }
    // Only send the token when the admin typed a new one — empty preserves it.
    if (token.trim()) body.instagramPageAccessToken = token.trim()
    save.mutate(body, { onSuccess: () => setToken('') })
  }

  // Local readiness check — confirms the connection is fully configured.
  function onTest() {
    setTested(
      enabled &&
        accountId.trim() !== '' &&
        verifyToken.trim() !== '' &&
        (token.trim() !== '' || Boolean(clinic.instagramAccountId)),
    )
  }

  return (
    <Section title={t('clinic.section.instagram')}>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span className="font-medium">{t('instagram.enable')}</span>
      </label>
      <p className="mb-3 text-xs text-gray-500">{t('instagram.enableHint')}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('instagram.accountId')}>
          <input value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`w-full ${inputCls}`} />
        </Field>
        <Field label={t('instagram.verifyToken')}>
          <input
            value={verifyToken}
            onChange={(e) => setVerifyToken(e.target.value)}
            className={`w-full ${inputCls}`}
          />
        </Field>
        <Field label={t('instagram.pageToken')}>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={clinic.instagramAccountId ? '••••••••' : ''}
            className={`w-full ${inputCls}`}
          />
        </Field>
        <Field label={t('instagram.tokenExpiry')}>
          <input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className={`w-full ${inputCls}`}
          />
        </Field>
      </div>
      <p className="mt-1 text-xs text-gray-400">{t('instagram.pageTokenHint')}</p>
      <p className="mt-1 text-xs text-gray-400">{t('instagram.tokenExpiryHint')}</p>
      <p className="mt-1 text-xs text-gray-400">{t('instagram.hint', { url: webhookUrl })}</p>
      <p className="mt-1 text-xs text-gray-400">{t('instagram.note')}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || save.isPending}
          className="rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-40 dark:bg-gray-700"
        >
          {save.isPending ? t('common.saving') : t('common.save')}
        </button>
        <button
          type="button"
          onClick={onTest}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold hover:border-gray-400 dark:border-gray-700"
        >
          {t('instagram.test')}
        </button>
        {tested === true && <span className="text-xs text-emerald-600">{t('instagram.testOk')}</span>}
        {tested === false && <span className="text-xs text-red-600">{t('instagram.testFail')}</span>}
        {save.isSuccess && !dirty && <span className="text-xs text-emerald-600">{t('common.saved')}</span>}
      </div>
    </Section>
  )
}

function LicenseSection({ clinicId }: { clinicId: string }) {
  const { t, language } = useI18n()
  const qc = useQueryClient()
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['license', clinicId],
    queryFn: () => api.get<{ license: ClinicLicense }>(`/clinics/${clinicId}/license`),
  })
  const license = query.data?.license

  const save = useMutation({
    mutationFn: () => api.post(`/clinics/${clinicId}/license`, { licenseKey: key.trim() }),
    onSuccess: () => {
      setKey('')
      setError(null)
      qc.invalidateQueries({ queryKey: ['license', clinicId] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : t('common.error')),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (key.trim()) save.mutate()
  }

  return (
    <Section title={t('clinic.section.license')}>
      {query.isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : license ? (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <LicenseBadge state={license.state} />
          {license.seats !== undefined && (
            <span className="text-gray-500">
              {t('license.seats')}: <span className="text-gray-800 dark:text-gray-200">{license.seats}</span>
            </span>
          )}
          {license.expiresAt && (
            <span className="text-gray-500">
              {t('license.expiresAt')}:{' '}
              <span className="text-gray-800 dark:text-gray-200">
                {formatDateTime(license.expiresAt, language)}
              </span>
            </span>
          )}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t('license.keyPlaceholder')}
          className={`flex-1 ${inputCls}`}
        />
        <button
          type="submit"
          disabled={save.isPending || !key.trim()}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {license && license.state !== 'none' ? t('license.renew') : t('license.add')}
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-gray-400">{t('license.never')}</p>
    </Section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      {children}
    </label>
  )
}

function SaveBar({
  dirty,
  pending,
  saved,
  onSave,
}: {
  dirty: boolean
  pending: boolean
  saved: boolean
  onSave: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || pending}
        className="rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-40 dark:bg-gray-700"
      >
        {pending ? t('common.saving') : t('common.save')}
      </button>
      {saved && <span className="text-xs text-emerald-600">{t('common.saved')}</span>}
    </div>
  )
}
