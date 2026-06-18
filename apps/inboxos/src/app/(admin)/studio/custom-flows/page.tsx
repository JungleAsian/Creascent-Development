'use client'

// IA Studio — Custom flow management (Gap #34). Keyword-triggered scripted flows
// that bypass intent classification / the LLM. List / add / delete / enable.
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { ClinicSelect } from '@/shared/components/ClinicSelect'
import { useI18n } from '@/shared/hooks/useI18n'
import type { CustomFlow, CustomFlowAction, CustomFlowLanguage } from '@/shared/types'

export default function CustomFlowsPage() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [clinicId, setClinicId] = useState('')

  const key = ['custom-flows', clinicId]
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ flows: CustomFlow[] }>(`/clinics/${clinicId}/custom-flows`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/clinics/${clinicId}/custom-flows/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/clinics/${clinicId}/custom-flows/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const flows = query.data?.flows ?? []

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('studio.customFlows.title')}</h1>
        <ClinicSelect value={clinicId} onChange={setClinicId} label={t('analytics.selectClinic')} />
      </div>

      {!clinicId ? (
        <p className="text-sm text-gray-400">{t('studio.customFlows.selectClinic')}</p>
      ) : (
        <>
          <NewFlowForm clinicId={clinicId} />

          {query.isLoading ? (
            <p className="text-sm text-gray-400">{t('common.loading')}</p>
          ) : flows.length === 0 ? (
            <p className="text-sm text-gray-400">{t('studio.customFlows.empty')}</p>
          ) : (
            <ul className="space-y-2">
              {flows.map((flow) => (
                <li
                  key={flow.id}
                  className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {flow.name}
                        {!flow.enabled && <span className="ml-2 text-xs text-gray-400">({t('studio.customFlows.disable')})</span>}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {t('studio.customFlows.keywords')}: {flow.triggerKeywords.join(', ')}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs text-gray-500">
                        {flow.messages.join('\n')}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => toggleMutation.mutate({ id: flow.id, enabled: !flow.enabled })}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                      >
                        {flow.enabled ? t('studio.customFlows.disable') : t('studio.customFlows.enable')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(t('studio.customFlows.deleteConfirm'))) deleteMutation.mutate(flow.id)
                        }}
                        className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function NewFlowForm({ clinicId }: { clinicId: string }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [keywords, setKeywords] = useState('')
  const [messages, setMessages] = useState('')
  const [action, setAction] = useState<CustomFlowAction | ''>('')
  const [language, setLanguage] = useState<CustomFlowLanguage>('both')

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/clinics/${clinicId}/custom-flows`, {
        name,
        triggerKeywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
        messages: messages.split('\n').map((m) => m.trim()).filter(Boolean),
        action: action || null,
        language,
      }),
    onSuccess: () => {
      setName('')
      setKeywords('')
      setMessages('')
      setAction('')
      setLanguage('both')
      qc.invalidateQueries({ queryKey: ['custom-flows', clinicId] })
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const kw = keywords.split(',').map((k) => k.trim()).filter(Boolean)
    const msgs = messages.split('\n').map((m) => m.trim()).filter(Boolean)
    if (name.trim() && kw.length > 0 && msgs.length > 0) mutation.mutate()
  }

  const field = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800'

  return (
    <form onSubmit={onSubmit} className="mb-6 space-y-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('studio.customFlows.name')} className={field} />
      <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={t('studio.customFlows.keywords')} className={field} />
      <textarea
        value={messages}
        onChange={(e) => setMessages(e.target.value)}
        rows={3}
        placeholder={t('studio.customFlows.messages')}
        className={`${field} resize-none`}
      />
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-1 text-xs text-gray-500">
          {t('studio.customFlows.action')}
          <select value={action} onChange={(e) => setAction(e.target.value as CustomFlowAction | '')} className={field}>
            <option value="">{t('studio.customFlows.actionNone')}</option>
            <option value="book">{t('studio.customFlows.actionBook')}</option>
            <option value="handoff">{t('studio.customFlows.actionHandoff')}</option>
            <option value="end">{t('studio.customFlows.actionEnd')}</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          {t('studio.customFlows.language')}
          <select value={language} onChange={(e) => setLanguage(e.target.value as CustomFlowLanguage)} className={field}>
            <option value="both">{t('studio.customFlows.langBoth')}</option>
            <option value="es">{t('studio.customFlows.langEs')}</option>
            <option value="en">{t('studio.customFlows.langEn')}</option>
          </select>
        </label>
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {t('studio.customFlows.add')}
      </button>
    </form>
  )
}
