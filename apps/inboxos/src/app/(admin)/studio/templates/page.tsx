'use client'

// IA Studio — WhatsApp message templates (Gap #29). Pick a clinic, register the
// templates submitted to Meta and track their approval status. Submission to Meta
// is manual; this only records status (pending | approved | rejected).
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { ClinicSelect } from '@/shared/components/ClinicSelect'
import { useI18n } from '@/shared/hooks/useI18n'
import type { MessageTemplate, MessageTemplateCategory, MessageTemplateStatus } from '@/shared/types'

const CATEGORIES: MessageTemplateCategory[] = [
  'appointment_confirmation',
  'appointment_reminder',
  'human_handoff_notification',
]
const STATUSES: MessageTemplateStatus[] = ['pending', 'approved', 'rejected']

const STATUS_BADGE: Record<MessageTemplateStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

export default function TemplatesPage() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [clinicId, setClinicId] = useState('')

  const key = ['message-templates', clinicId]
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ templates: MessageTemplate[] }>(`/clinics/${clinicId}/message-templates`),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MessageTemplateStatus }) =>
      api.patch(`/clinics/${clinicId}/message-templates/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const templates = query.data?.templates ?? []

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('studio.templates.title')}</h1>
        <ClinicSelect value={clinicId} onChange={setClinicId} label={t('studio.usage.selectClinic')} />
      </div>

      {!clinicId ? (
        <p className="text-sm text-gray-400">{t('studio.templates.selectClinic')}</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-gray-400">{t('studio.templates.note')}</p>
          <NewTemplateForm clinicId={clinicId} />

          {query.isLoading ? (
            <p className="text-sm text-gray-400">{t('common.loading')}</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-gray-400">{t('studio.templates.empty')}</p>
          ) : (
            <ul className="space-y-2">
              {templates.map((tpl) => (
                <li
                  key={tpl.id}
                  className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{tpl.name}</p>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500 dark:bg-gray-800">
                      {t(`studio.templates.category.${tpl.category}` as const)}
                    </span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500 dark:bg-gray-800">
                      {tpl.language}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[tpl.status]}`}>
                      {t(`studio.templates.status.${tpl.status}` as const)}
                    </span>
                    <select
                      value={tpl.status}
                      onChange={(e) =>
                        statusMutation.mutate({ id: tpl.id, status: e.target.value as MessageTemplateStatus })
                      }
                      disabled={statusMutation.isPending}
                      className="ml-auto rounded border border-gray-300 bg-transparent px-1 py-0.5 text-[10px] uppercase text-gray-500 dark:border-gray-700"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-xs text-gray-500">{tpl.body}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function NewTemplateForm({ clinicId }: { clinicId: string }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<MessageTemplateCategory>('appointment_confirmation')
  const [language, setLanguage] = useState('es')
  const [body, setBody] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/clinics/${clinicId}/message-templates`, { name, category, language, body }),
    onSuccess: () => {
      setName('')
      setBody('')
      qc.invalidateQueries({ queryKey: ['message-templates', clinicId] })
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (name.trim() && body.trim()) mutation.mutate()
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-6 space-y-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('studio.templates.name')}
          className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as MessageTemplateCategory)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`studio.templates.category.${c}` as const)}
            </option>
          ))}
        </select>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <option value="es">es</option>
          <option value="en">en</option>
        </select>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={t('studio.templates.body')}
        className="w-full resize-none rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
      />
      <button
        type="submit"
        disabled={mutation.isPending || !name.trim() || !body.trim()}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {t('studio.templates.submit')}
      </button>
    </form>
  )
}
