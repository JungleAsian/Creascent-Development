'use client'

// IA Studio — Quick reply template management (Gap #25). Pick a clinic, then list /
// add / delete its canned replies. Secretaries pick from these in the composer.
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { ClinicSelect } from '@/shared/components/ClinicSelect'
import { useI18n } from '@/shared/hooks/useI18n'
import type { QuickReplyTemplate } from '@/shared/types'

export default function QuickRepliesPage() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [clinicId, setClinicId] = useState('')

  const key = ['quick-reply-templates', clinicId]
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(clinicId),
    queryFn: () =>
      api.get<{ templates: QuickReplyTemplate[] }>(`/clinics/${clinicId}/quick-reply-templates`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/clinics/${clinicId}/quick-reply-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const templates = query.data?.templates ?? []

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('studio.quickReplies.title')}</h1>
        <ClinicSelect value={clinicId} onChange={setClinicId} label={t('studio.usage.selectClinic')} />
      </div>

      {!clinicId ? (
        <p className="text-sm text-gray-400">{t('studio.quickReplies.selectClinic')}</p>
      ) : (
        <>
          <NewTemplateForm clinicId={clinicId} />

          {query.isLoading ? (
            <p className="text-sm text-gray-400">{t('common.loading')}</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-gray-400">{t('studio.quickReplies.empty')}</p>
          ) : (
            <ul className="space-y-2">
              {templates.map((tpl) => (
                <TemplateRow
                  key={tpl.id}
                  clinicId={clinicId}
                  template={tpl}
                  onDelete={() => {
                    if (confirm(t('studio.quickReplies.deleteConfirm'))) deleteMutation.mutate(tpl.id)
                  }}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

// One template row with inline edit (closes the CRUD gap — add/edit/delete).
function TemplateRow({
  clinicId,
  template,
  onDelete,
}: {
  clinicId: string
  template: QuickReplyTemplate
  onDelete: () => void
}) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(template.title)
  const [content, setContent] = useState(template.content)

  const updateMutation = useMutation({
    mutationFn: () =>
      api.patch(`/clinics/${clinicId}/quick-reply-templates/${template.id}`, { title, content }),
    onSuccess: () => {
      setEditing(false)
      qc.invalidateQueries({ queryKey: ['quick-reply-templates', clinicId] })
    },
  })

  function startEdit() {
    setTitle(template.title)
    setContent(template.content)
    setEditing(true)
  }

  if (editing) {
    return (
      <li className="space-y-2 rounded-lg border border-indigo-200 bg-white p-3 dark:border-indigo-900 dark:bg-gray-900">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('studio.quickReplies.titleField')}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder={t('studio.quickReplies.content')}
          className="w-full resize-none rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={updateMutation.isPending || !title.trim() || !content.trim()}
            onClick={() => {
              if (title.trim() && content.trim()) updateMutation.mutate()
            }}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {t('common.save')}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {t('common.cancel')}
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="min-w-0">
        <p className="font-medium">{template.title}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-xs text-gray-500">{template.content}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={startEdit}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {t('common.edit')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
        >
          {t('common.delete')}
        </button>
      </div>
    </li>
  )
}

function NewTemplateForm({ clinicId }: { clinicId: string }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.post(`/clinics/${clinicId}/quick-reply-templates`, { title, content }),
    onSuccess: () => {
      setTitle('')
      setContent('')
      qc.invalidateQueries({ queryKey: ['quick-reply-templates', clinicId] })
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (title.trim() && content.trim()) mutation.mutate()
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-6 space-y-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('studio.quickReplies.titleField')}
        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        placeholder={t('studio.quickReplies.content')}
        className="w-full resize-none rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
      />
      <button
        type="submit"
        disabled={mutation.isPending || !title.trim() || !content.trim()}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {t('studio.quickReplies.add')}
      </button>
    </form>
  )
}
