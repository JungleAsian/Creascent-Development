'use client'

// Clinic Inbox — the 3-column workspace: conversation list (left), the active
// conversation (center), and the contextual panels (right): tags, internal notes
// and assignment.
//
// Req 39 (mobile): on a phone the three columns can't coexist, so the layout
// collapses to one column — the conversation list fills the screen until a thread
// is opened, then the conversation takes over (with a Back affordance) and the
// contextual panels move behind a Details slide-over. From md up it stays the
// classic three-pane desktop grid.
import { useEffect, useState } from 'react'
import { ConversationList } from '@/shared/components/ConversationList'
import { ConversationView } from '@/shared/components/ConversationView'
import { PatientCard } from '@/shared/components/PatientCard'
import { LifecyclePanel } from '@/shared/components/LifecyclePanel'
import { TagsPanel } from '@/shared/components/TagsPanel'
import { NotesPanel } from '@/shared/components/NotesPanel'
import { AssignPanel } from '@/shared/components/AssignPanel'
import { AssistantPanel } from '@/shared/components/AssistantPanel'
import { useI18n } from '@/shared/hooks/useI18n'
import { useOnline } from '@/shared/hooks/useOnline'

export default function InboxPage() {
  const { t } = useI18n()
  const online = useOnline()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelsOpen, setPanelsOpen] = useState(false)

  // Selecting (or clearing) a thread always closes the mobile detail drawer so the
  // small-screen flow stays predictable when switching conversations.
  const select = (id: string | null) => {
    setSelectedId(id)
    setPanelsOpen(false)
  }

  // Deep-link from the Alerts center (Screen 11): /inbox?c=<conversationId> opens
  // that thread on load. Read once from the URL on mount (no useSearchParams, so the
  // route stays statically prerenderable and needs no Suspense boundary).
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c')
    if (c) setSelectedId(c)
  }, [])

  // Key every conversation-scoped panel by the thread id so React remounts them
  // on switch — otherwise local state (the reply draft, AI summary/suggestions,
  // a half-typed note) bleeds into the next patient's thread and can be sent to
  // the wrong recipient.
  const panels = selectedId ? (
    <>
      <PatientCard key={`patient-${selectedId}`} conversationId={selectedId} />
      <AssignPanel key={`assign-${selectedId}`} conversationId={selectedId} />
      <LifecyclePanel key={`lifecycle-${selectedId}`} conversationId={selectedId} />
      <TagsPanel key={`tags-${selectedId}`} conversationId={selectedId} />
      <AssistantPanel key={`assistant-${selectedId}`} conversationId={selectedId} />
      <NotesPanel key={`notes-${selectedId}`} conversationId={selectedId} />
    </>
  ) : (
    <p className="p-4 text-sm text-gray-400">{t('view.empty')}</p>
  )

  return (
    <div className="flex h-full flex-col">
      {/* Offline / disconnected banner — a required operational state: when the
          browser loses its network, a reply can't reach the patient, so make it
          unmistakable across the whole inbox (drafts stay in local component state). */}
      {!online && (
        <div
          role="status"
          className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <span aria-hidden className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          <span className="font-semibold">{t('conn.offline.title')}</span>
          <span className="hidden min-w-0 truncate opacity-90 sm:inline">— {t('conn.offline.body')}</span>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[18rem_1fr_18rem]">
      {/* Conversation list — full width on mobile until a thread is opened. */}
      <div
        className={`${selectedId ? 'hidden md:block' : 'block'} overflow-hidden border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900`}
      >
        <ConversationList selectedId={selectedId} onSelect={select} />
      </div>

      {/* Active conversation — takes over the screen on mobile once a thread is open. */}
      <div
        className={`${selectedId ? 'flex' : 'hidden md:flex'} min-w-0 flex-col overflow-hidden bg-white dark:bg-gray-950`}
      >
        {selectedId ? (
          <>
            {/* Mobile-only action bar: back to the list + open the detail panel. */}
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-2 md:hidden dark:border-gray-800">
              <button
                type="button"
                onClick={() => select(null)}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300"
              >
                ← {t('inbox.backToList')}
              </button>
              <button
                type="button"
                onClick={() => setPanelsOpen(true)}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300"
              >
                {t('inbox.details')}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <ConversationView key={selectedId} conversationId={selectedId} onConversationChange={select} />
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">{t('view.empty')}</p>
          </div>
        )}
      </div>

      {/* Contextual panels — static third column on desktop. */}
      <div className="hidden overflow-y-auto border-l border-gray-200 bg-white md:block dark:border-gray-800 dark:bg-gray-900">
        {panels}
      </div>
      </div>

      {/* …and the same panels as a right-hand slide-over drawer on mobile. */}
      {panelsOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            type="button"
            aria-label={t('common.closeMenu')}
            onClick={() => setPanelsOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative z-10 ml-auto h-full w-80 max-w-[85%] overflow-y-auto border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            {panels}
          </div>
        </div>
      )}
    </div>
  )
}
