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
import { useState } from 'react'
import { ConversationList } from '@/shared/components/ConversationList'
import { ConversationView } from '@/shared/components/ConversationView'
import { TagsPanel } from '@/shared/components/TagsPanel'
import { NotesPanel } from '@/shared/components/NotesPanel'
import { AssignPanel } from '@/shared/components/AssignPanel'
import { AssistantPanel } from '@/shared/components/AssistantPanel'
import { useI18n } from '@/shared/hooks/useI18n'

export default function InboxPage() {
  const { t } = useI18n()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelsOpen, setPanelsOpen] = useState(false)

  // Selecting (or clearing) a thread always closes the mobile detail drawer so the
  // small-screen flow stays predictable when switching conversations.
  const select = (id: string | null) => {
    setSelectedId(id)
    setPanelsOpen(false)
  }

  // Key every conversation-scoped panel by the thread id so React remounts them
  // on switch — otherwise local state (the reply draft, AI summary/suggestions,
  // a half-typed note) bleeds into the next patient's thread and can be sent to
  // the wrong recipient.
  const panels = selectedId ? (
    <>
      <TagsPanel key={`tags-${selectedId}`} conversationId={selectedId} />
      <AssistantPanel key={`assistant-${selectedId}`} conversationId={selectedId} />
      <NotesPanel key={`notes-${selectedId}`} conversationId={selectedId} />
      <AssignPanel key={`assign-${selectedId}`} conversationId={selectedId} />
    </>
  ) : (
    <p className="p-4 text-sm text-gray-400">{t('view.empty')}</p>
  )

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[18rem_1fr_18rem]">
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
