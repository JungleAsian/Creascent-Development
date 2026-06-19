'use client'

// Conversation view (center column): message history, a mode rail showing whether
// the AI bot or a human secretary is driving the thread, a send box, and
// resolve/reopen actions. Reopen creates a NEW conversation (Decision 4) and the
// view follows the caller to it via onConversationChange.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useI18n } from '../hooks/useI18n'
import { formatDateTime } from '../format'
import { AssignControl } from './AssignControl'
import { QuickReplyPicker } from './QuickReplyPicker'
import { deliveryIndicator, type DeliveryTone } from '../delivery'
import { isImageMessage, messageMediaPath } from '../media'
import type {
  Appointment,
  AppointmentStatus,
  Conversation,
  ConversationStatus,
  Message,
  MessageRole,
} from '../types'

// Compact status colours for the in-thread appointment summary (mirrors the
// patient-history page palette, kept local so the view stays self-contained).
const APPT_BADGE: Record<AppointmentStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  confirmed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  no_show: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

const ROLE_LABEL: Record<MessageRole, 'view.role.user' | 'view.role.agent' | 'view.role.assistant' | 'view.role.system'> = {
  user: 'view.role.user',
  agent: 'view.role.agent',
  assistant: 'view.role.assistant',
  system: 'view.role.system',
}

// Req 11: lifecycle transitions a secretary can pick manually. assigned/handoff
// are driven by the dedicated assign/handoff flows, so they are excluded here
// (the current status is still shown if the conversation is in one of them).
const MANUAL_STATUSES: ConversationStatus[] = ['open', 'pending', 'snoozed', 'resolved', 'archived']

// A conversation is "closed" (composer disabled, reopen offered) when resolved or
// archived — both are terminal; reopening either creates a fresh conversation.
function isClosedStatus(status: ConversationStatus | undefined): boolean {
  return status === 'resolved' || status === 'archived'
}

export function ConversationView({
  conversationId,
  onConversationChange,
}: {
  conversationId: string
  onConversationChange: (id: string) => void
}) {
  const { t, language } = useI18n()
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  const conversationQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.get<{ conversation: Conversation }>(`/conversations/${conversationId}`),
  })
  const messagesQuery = useQuery({
    queryKey: ['messages', conversationId],
    refetchInterval: 10_000,
    queryFn: () => api.get<{ messages: Message[] }>(`/conversations/${conversationId}/messages`),
  })

  const conversation = conversationQuery.data?.conversation
  const messages = messagesQuery.data?.messages ?? []
  const closed = isClosedStatus(conversation?.status)
  // The bot drives an open thread; once a human is assigned or it's escalated, a
  // secretary is in control.
  const humanMode = conversation?.status === 'assigned' || conversation?.status === 'handoff'

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length])

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/conversations/${conversationId}/messages`, { content }),
    onSuccess: () => {
      setDraft('')
      qc.invalidateQueries({ queryKey: ['messages', conversationId] })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  const closeMutation = useMutation({
    mutationFn: () => api.post(`/conversations/${conversationId}/close`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  const reopenMutation = useMutation({
    mutationFn: () => api.post<{ conversation: Conversation }>(`/conversations/${conversationId}/reopen`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
      onConversationChange(data.conversation.id)
    },
  })

  const statusMutation = useMutation({
    mutationFn: (status: ConversationStatus) =>
      api.post(`/conversations/${conversationId}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  // Req 29: flag a bad bot reply → IA Studio Error Review (bad_response).
  const flagMutation = useMutation({
    mutationFn: (message: Message) =>
      api.post(`/conversations/${conversationId}/flag-response`, {
        messageId: message.id,
        content: message.content,
      }),
    onSuccess: (_data, message) => {
      setFlaggedIds((prev) => new Set(prev).add(message.id))
    },
  })

  function onSend(e: FormEvent) {
    e.preventDefault()
    const content = draft.trim()
    if (content) sendMutation.mutate(content)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header + mode rail */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{conversation?.channelContactHandle ?? '…'}</p>
            <p className="text-xs capitalize text-gray-400">{conversation?.channel}</p>
          </div>
          <div className="flex items-center gap-3">
            <AssignControl conversationId={conversationId} />
            {conversation?.patientId && (
              <Link
                href={`/inbox/${conversationId}/patient`}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                {t('patient.title')}
              </Link>
            )}
            {conversation && (
              <select
                aria-label={t('view.changeStatus')}
                value={conversation.status}
                onChange={(e) => statusMutation.mutate(e.target.value as ConversationStatus)}
                disabled={statusMutation.isPending}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                {(MANUAL_STATUSES.includes(conversation.status)
                  ? MANUAL_STATUSES
                  : [conversation.status, ...MANUAL_STATUSES]
                ).map((s) => (
                  <option key={s} value={s}>
                    {t(`conv.status.${s}` as const)}
                  </option>
                ))}
              </select>
            )}
            {conversation &&
            (closed ? (
              <button
                type="button"
                onClick={() => reopenMutation.mutate()}
                disabled={reopenMutation.isPending}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                {t('view.reopen')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => closeMutation.mutate()}
                disabled={closeMutation.isPending}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                {t('view.close')}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 pb-2 text-xs">
          <span className="font-medium text-gray-500">{t('view.mode.title')}:</span>
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${
              humanMode
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
            }`}
          >
            {humanMode ? t('view.mode.human') : t('view.mode.bot')}
          </span>
          <span className="text-gray-400">{humanMode ? t('view.mode.humanHint') : t('view.mode.botHint')}</span>
        </div>
        {conversation?.patientId && (
          <ApptSummary conversationId={conversationId} patientId={conversation.patientId} />
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messagesQuery.isLoading ? (
          <p className="text-sm text-gray-400">{t('common.loading')}</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-400">{t('view.noMessages')}</p>
        ) : (
          messages.map((m) => {
            const ind = deliveryIndicator(m)
            return (
              <MessageBubble
                key={m.id}
                message={m}
                roleLabel={t(ROLE_LABEL[m.role])}
                voiceLabel={t('view.voiceNote')}
                flagLabel={t('view.flagResponse')}
                flaggedLabel={t('view.flagged')}
                flagged={flaggedIds.has(m.id)}
                flagging={flagMutation.isPending && flagMutation.variables?.id === m.id}
                onFlag={() => flagMutation.mutate(m)}
                delivery={ind ? { glyph: ind.glyph, tone: ind.tone, label: t(ind.labelKey) } : null}
                language={language}
                conversationId={conversationId}
                imageLabel={t('view.image')}
              />
            )
          })
        )}
      </div>

      {/* Composer */}
      {closed ? (
        <p className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900">
          {t('view.closedNotice')}
        </p>
      ) : (
        <form onSubmit={onSend} className="flex items-end gap-2 border-t border-gray-200 p-3 dark:border-gray-800">
          <QuickReplyPicker
            onPick={(content) => setDraft((d) => (d.trim() ? `${d}\n${content}` : content))}
          />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend(e)
              }
            }}
            rows={2}
            placeholder={t('view.placeholder')}
            className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-800"
          />
          <button
            type="submit"
            disabled={sendMutation.isPending || !draft.trim()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {sendMutation.isPending ? t('view.sending') : t('view.send')}
          </button>
        </form>
      )}
    </div>
  )
}

// Req 4 / Req 16: surface the patient's appointment status in-thread so a
// secretary sees the next (or, failing that, the most recent) appointment without
// leaving the conversation. Picks the soonest upcoming non-cancelled appointment;
// if there is none, falls back to the most recent past one. Links to the full
// patient history. Best-effort: renders nothing while loading or on error.
function ApptSummary({ conversationId, patientId }: { conversationId: string; patientId: string }) {
  const { t, language } = useI18n()
  const appointmentsQuery = useQuery({
    queryKey: ['patient-appointments', patientId],
    queryFn: () => api.get<{ appointments: Appointment[] }>(`/patients/${patientId}/appointments`),
  })

  if (appointmentsQuery.isLoading || appointmentsQuery.isError) return null
  const appointments = appointmentsQuery.data?.appointments ?? []

  const now = new Date().toISOString()
  // listByPatient returns appointments newest-first (start_time DESC).
  const upcoming = appointments
    .filter((a) => a.startTime >= now && a.status !== 'cancelled')
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
  const next = upcoming[0]
  const last = appointments.find((a) => a.startTime < now)
  const appt = next ?? last
  const label = next ? t('view.appt.next') : t('view.appt.last')

  return (
    <div className="flex items-center gap-2 px-4 pb-2 text-xs">
      <span aria-hidden>📅</span>
      {appt ? (
        <Link
          href={`/inbox/${conversationId}/patient`}
          className="flex items-center gap-2 hover:text-indigo-600"
        >
          <span className="font-medium text-gray-500">{label}:</span>
          <span className="text-gray-600 dark:text-gray-300">{formatDateTime(appt.startTime, language)}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${APPT_BADGE[appt.status]}`}>
            {t(`appt.status.${appt.status}` as const)}
          </span>
        </Link>
      ) : (
        <span className="text-gray-400">{t('view.appt.none')}</span>
      )}
    </div>
  )
}

// Tailwind classes per delivery tone (Req 3). `muted` rides the bubble's own text
// colour at low opacity (subtle ✓/✓✓), `read` is a blue double-check, `failed` red.
const DELIVERY_TONE: Record<DeliveryTone, string> = {
  muted: 'opacity-70',
  read: 'text-sky-500 dark:text-sky-400',
  failed: 'text-red-600 dark:text-red-400',
}

function MessageBubble({
  message,
  roleLabel,
  voiceLabel,
  flagLabel,
  flaggedLabel,
  flagged,
  flagging,
  onFlag,
  delivery,
  language,
  conversationId,
  imageLabel,
}: {
  message: Message
  roleLabel: string
  voiceLabel: string
  flagLabel: string
  flaggedLabel: string
  flagged: boolean
  flagging: boolean
  onFlag: () => void
  delivery: { glyph: string; tone: DeliveryTone; label: string } | null
  language: 'es' | 'en'
  conversationId: string
  imageLabel: string
}) {
  // Patient messages on the left; clinic (agent/bot/system) on the right.
  const fromPatient = message.role === 'user'
  // Only the bot's own replies can be flagged as a bad response (Req 29).
  const canFlag = message.role === 'assistant'
  // Voice note (Req 8): a transcribed audio message shows a 🎤 marker above its
  // transcript so the secretary knows the patient spoke rather than typed.
  const isVoiceNote = message.contentType === 'audio'
  // Image (Req 3): a patient's photo is rendered inline; the message content, if any,
  // is the caption shown beneath it.
  const isImage = isImageMessage(message)
  const transcript = message.transcription ?? message.content
  return (
    <div className={`group flex ${fromPatient ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
          fromPatient
            ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
            : message.role === 'assistant'
              ? 'bg-indigo-100 text-indigo-950 dark:bg-indigo-900/50 dark:text-indigo-100'
              : 'bg-indigo-600 text-white'
        }`}
      >
        <div className="mb-0.5 flex items-center gap-2 text-[10px] opacity-70">
          <span>{roleLabel}</span>
          <span>{formatDateTime(message.createdAt, language)}</span>
          {delivery && (
            <span
              className={`ml-auto flex items-center gap-1 font-semibold ${DELIVERY_TONE[delivery.tone]}`}
              title={delivery.label}
            >
              <span aria-hidden>{delivery.glyph}</span>
              {delivery.tone === 'failed' && <span>{delivery.label}</span>}
              <span className="sr-only">{delivery.label}</span>
            </span>
          )}
        </div>
        {isVoiceNote && (
          <div className="mb-1 flex items-center gap-1 text-[11px] font-medium opacity-80">
            <span aria-hidden>🎤</span>
            <span>{voiceLabel}</span>
          </div>
        )}
        {isImage && (
          <MessageImage
            conversationId={conversationId}
            messageId={message.id}
            alt={imageLabel}
          />
        )}
        {/* Image messages show their caption (if any) below the image; non-image
            messages show their text/transcript. */}
        {(!isImage || transcript) && (
          <p className="whitespace-pre-wrap break-words">{transcript}</p>
        )}
        {canFlag && (
          <div className="mt-1 text-right">
            {flagged ? (
              <span className="text-[10px] font-medium text-red-600 dark:text-red-400">
                ⚑ {flaggedLabel}
              </span>
            ) : (
              <button
                type="button"
                onClick={onFlag}
                disabled={flagging}
                title={flagLabel}
                className="text-[10px] font-medium text-gray-400 opacity-0 transition hover:text-red-600 group-hover:opacity-100 disabled:opacity-60 dark:hover:text-red-400"
              >
                ⚑ {flagLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Inbound image (Req 3): fetch the patient's photo through the authenticated proxy
// (the browser can't set the bearer header on a plain <img src>) as a blob, render
// it from an object URL, and revoke the URL on unmount. Shows a placeholder while
// loading and a fallback marker if the fetch fails (e.g. an expired Meta media id).
function MessageImage({
  conversationId,
  messageId,
  alt,
}: {
  conversationId: string
  messageId: string
  alt: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    api
      .blobUrl(messageMediaPath(conversationId, messageId))
      .then((u) => {
        if (!active) {
          URL.revokeObjectURL(u)
          return
        }
        objectUrl = u
        setUrl(u)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [conversationId, messageId])

  if (failed) {
    return (
      <div className="my-1 flex items-center gap-1 rounded-lg bg-black/5 px-2 py-3 text-[11px] opacity-70 dark:bg-white/10">
        <span aria-hidden>🖼️</span>
        <span>{alt} ⚠</span>
      </div>
    )
  }
  if (!url) {
    return <div className="my-1 h-32 w-48 max-w-full animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />
  }
  // A blob object URL (not a static/remote asset), so next/image can't optimise it.
  return <img src={url} alt={alt} className="my-1 max-h-64 max-w-full rounded-lg" />
}
