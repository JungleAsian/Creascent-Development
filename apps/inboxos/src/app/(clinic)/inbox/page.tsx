'use client'

// Clinic Inbox — the 3-column workspace: conversation list (left), the active
// conversation (center), and the contextual panels (right): tags, internal notes
// and assignment.
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

  return (
    <div className="grid h-full grid-cols-[18rem_1fr_18rem]">
      <div className="overflow-hidden border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <ConversationList selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      <div className="overflow-hidden bg-white dark:bg-gray-950">
        {selectedId ? (
          <ConversationView conversationId={selectedId} onConversationChange={setSelectedId} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">{t('view.empty')}</p>
          </div>
        )}
      </div>

      <div className="overflow-y-auto border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {selectedId ? (
          <>
            <TagsPanel conversationId={selectedId} />
            <AssistantPanel conversationId={selectedId} />
            <NotesPanel conversationId={selectedId} />
            <AssignPanel conversationId={selectedId} />
          </>
        ) : (
          <p className="p-4 text-sm text-gray-400">{t('view.empty')}</p>
        )}
      </div>
    </div>
  )
}
