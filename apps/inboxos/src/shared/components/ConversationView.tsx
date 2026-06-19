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
import type { Conversation, Message, MessageRole } from '../types'

const ROLE_LABEL: Record<MessageRole, 'view.role.user' | 'view.role.agent' | 'view.role.assistant' | 'view.role.system'> = {
  user: 'view.role.user',
  agent: 'view.role.agent',
  assistant: 'view.role.assistant',
  system: 'view.role.system',
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
  const resolved = conversation?.status === 'resolved'
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
            {conversation &&
            (resolved ? (
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
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messagesQuery.isLoading ? (
          <p className="text-sm text-gray-400">{t('common.loading')}</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-400">{t('view.noMessages')}</p>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              roleLabel={t(ROLE_LABEL[m.role])}
              voiceLabel={t('view.voiceNote')}
              language={language}
            />
          ))
        )}
      </div>

      {/* Composer */}
      {resolved ? (
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

function MessageBubble({
  message,
  roleLabel,
  voiceLabel,
  language,
}: {
  message: Message
  roleLabel: string
  voiceLabel: string
  language: 'es' | 'en'
}) {
  // Patient messages on the left; clinic (agent/bot/system) on the right.
  const fromPatient = message.role === 'user'
  // Voice note (Req 8): a transcribed audio message shows a 🎤 marker above its
  // transcript so the secretary knows the patient spoke rather than typed.
  const isVoiceNote = message.contentType === 'audio'
  const transcript = message.transcription ?? message.content
  return (
    <div className={`flex ${fromPatient ? 'justify-start' : 'justify-end'}`}>
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
        </div>
        {isVoiceNote && (
          <div className="mb-1 flex items-center gap-1 text-[11px] font-medium opacity-80">
            <span aria-hidden>🎤</span>
            <span>{voiceLabel}</span>
          </div>
        )}
        <p className="whitespace-pre-wrap break-words">{transcript}</p>
      </div>
    </div>
  )
}
