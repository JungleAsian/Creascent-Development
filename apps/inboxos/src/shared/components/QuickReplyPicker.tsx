'use client'

// Gap #25 — quick reply picker shown in the secretary message box. Opens a popover
// listing the clinic's templates; clicking one inserts its content into the
// composer via onPick. Templates are managed in IA Studio.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import { useI18n } from '../hooks/useI18n'
import type { QuickReplyTemplate } from '../types'

export function QuickReplyPicker({ onPick }: { onPick: (content: string) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const clinicId = useAuthStore((s) => s.user?.clinicId)

  const query = useQuery({
    queryKey: ['quick-reply-templates', clinicId],
    enabled: Boolean(clinicId) && open,
    queryFn: () =>
      api.get<{ templates: QuickReplyTemplate[] }>(`/clinics/${clinicId}/quick-reply-templates`),
  })
  const templates = query.data?.templates ?? []

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t('quickReply.button')}
        aria-label={t('quickReply.button')}
        className="rounded-md border border-gray-300 px-2 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
      >
        ⚡
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-2 max-h-72 w-72 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-gray-800">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('quickReply.title')}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              {t('quickReply.close')}
            </button>
          </div>

          {query.isLoading ? (
            <p className="p-3 text-xs text-gray-400">{t('common.loading')}</p>
          ) : templates.length === 0 ? (
            <p className="p-3 text-xs text-gray-400">{t('quickReply.empty')}</p>
          ) : (
            <ul>
              {templates.map((tpl) => (
                <li key={tpl.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(tpl.content)
                      setOpen(false)
                    }}
                    className="block w-full border-b border-gray-100 px-3 py-2 text-left hover:bg-indigo-50 dark:border-gray-800 dark:hover:bg-indigo-950/40"
                  >
                    <p className="text-xs font-medium">{tpl.title}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{tpl.content}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
