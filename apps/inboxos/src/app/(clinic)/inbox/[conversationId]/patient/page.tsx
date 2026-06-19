'use client'

// Gap #26 — Patient history view. Reached from the conversation header. Shows the
// patient profile, their appointment history (upcoming + past) and their past
// conversations. Closed conversations are READ-ONLY here — this view never reopens
// them (Decision 4); reopening only ever happens from the live conversation.
import { use } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { useI18n } from '@/shared/hooks/useI18n'
import { formatDateTime, relativeTime } from '@/shared/format'
import type {
  Appointment,
  AppointmentStatus,
  Conversation,
  ConversationStatus,
  Patient,
} from '@/shared/types'

const APPT_BADGE: Record<AppointmentStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  confirmed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  no_show: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

const CONV_BADGE: Record<ConversationStatus, string> = {
  open: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  handoff: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  snoozed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  resolved: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  archived: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

export default function PatientHistoryPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = use(params)
  const { t, language } = useI18n()

  const conversationQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.get<{ conversation: Conversation }>(`/conversations/${conversationId}`),
  })
  const patientId = conversationQuery.data?.conversation.patientId ?? null

  const patientQuery = useQuery({
    queryKey: ['patient', patientId],
    enabled: Boolean(patientId),
    queryFn: () => api.get<{ patient: Patient }>(`/patients/${patientId}`),
  })
  const appointmentsQuery = useQuery({
    queryKey: ['patient-appointments', patientId],
    enabled: Boolean(patientId),
    queryFn: () => api.get<{ appointments: Appointment[] }>(`/patients/${patientId}/appointments`),
  })
  const conversationsQuery = useQuery({
    queryKey: ['patient-conversations', patientId],
    enabled: Boolean(patientId),
    queryFn: () =>
      api.get<{ conversations: Conversation[] }>(`/patients/${patientId}/conversations`),
  })

  const conversation = conversationQuery.data?.conversation
  const patient = patientQuery.data?.patient
  const appointments = appointmentsQuery.data?.appointments ?? []
  const conversations = conversationsQuery.data?.conversations ?? []

  const now = new Date().toISOString()
  const upcoming = appointments.filter((a) => a.startTime >= now)
  const past = appointments.filter((a) => a.startTime < now)
  // Past closed conversations only, excluding the one we came from.
  const history = conversations.filter((c) => c.id !== conversationId && c.status === 'resolved')

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('patient.title')}</h1>
        <Link href="/inbox" className="text-xs text-gray-500 hover:text-indigo-600">
          ← {t('patient.back')}
        </Link>
      </div>

      {conversationQuery.isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : !patientId ? (
        <p className="text-sm text-gray-400">{t('patient.noPatient')}</p>
      ) : !patient ? (
        <p className="text-sm text-gray-400">{t('patient.notFound')}</p>
      ) : (
        <>
          <ProfileSection patient={patient} waId={conversation?.channelContactHandle ?? '—'} />

          <Section title={t('patient.appointments')}>
            {appointments.length === 0 ? (
              <p className="text-sm text-gray-400">{t('patient.noAppointments')}</p>
            ) : (
              <div className="space-y-4">
                {upcoming.length > 0 && (
                  <ApptGroup label={t('patient.upcoming')} appointments={upcoming} language={language} />
                )}
                {past.length > 0 && (
                  <ApptGroup label={t('patient.past')} appointments={past} language={language} />
                )}
              </div>
            )}
          </Section>

          <Section title={t('patient.conversations')}>
            <p className="mb-3 text-xs text-gray-400">{t('patient.readonly')}</p>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400">{t('patient.noConversations')}</p>
            ) : (
              <ul className="space-y-1.5">
                {history.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800"
                  >
                    <span className="truncate capitalize text-gray-600 dark:text-gray-300">
                      {c.channel}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CONV_BADGE[c.status]}`}>
                        {t(`conv.status.${c.status}` as const)}
                      </span>
                      <span className="text-xs text-gray-400">{relativeTime(c.lastMessageAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  )
}

function ProfileSection({ patient, waId }: { patient: Patient; waId: string }) {
  const { t } = useI18n()
  const meta = patient.metadata as { language?: unknown; consent?: unknown; optedOut?: unknown }
  const lang = meta.language === 'en' ? 'EN' : 'ES'
  const consent = meta.consent === true ? t('patient.consent.granted') : t('patient.consent.unknown')
  const optedOut = meta.optedOut === true

  return (
    <Section title={t('patient.profile')}>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Row label={t('patient.name')} value={patient.fullName ?? '—'} />
        <Row label={t('patient.waId')} value={waId} />
        <Row label={t('patient.language')} value={lang} />
        <Row label={t('patient.consent')} value={consent} />
        <Row
          label={t('patient.optedOut')}
          value={optedOut ? t('patient.yes') : t('patient.no')}
          danger={optedOut}
        />
      </dl>
    </Section>
  )
}

function ApptGroup({
  label,
  appointments,
  language,
}: {
  label: string
  appointments: Appointment[]
  language: 'es' | 'en'
}) {
  const { t } = useI18n()
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <ul className="space-y-1.5">
        {appointments.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800"
          >
            <span className="text-gray-700 dark:text-gray-200">{formatDateTime(a.startTime, language)}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${APPT_BADGE[a.status]}`}>
              {t(`appt.status.${a.status}` as const)}
            </span>
          </li>
        ))}
      </ul>
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

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-gray-100 py-1 dark:border-gray-800">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`font-medium ${danger ? 'text-red-600 dark:text-red-400' : ''}`}>{value}</dd>
    </div>
  )
}
