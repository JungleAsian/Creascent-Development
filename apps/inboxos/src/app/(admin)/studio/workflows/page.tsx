'use client'

// IA Studio — N8N-style automation workflows (Rev 3). A clinic builds a typed node
// graph (trigger → logic → action) on the visual canvas; active workflows run via
// the workflow-runner worker when their trigger fires. List / create / edit /
// activate / delete.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { ClinicSelect } from '@/shared/components/ClinicSelect'
import { WorkflowCanvas } from '@/shared/components/WorkflowCanvas'
import { useI18n } from '@/shared/hooks/useI18n'
import type { Workflow, WorkflowNode, WorkflowEdge, WorkflowStatus } from '@/shared/types'

const btn = 'rounded-md px-3 py-1.5 text-sm font-medium'

export default function WorkflowsPage() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [clinicId, setClinicId] = useState('')
  const [editing, setEditing] = useState<Workflow | 'new' | null>(null)

  const key = ['workflows', clinicId]
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ workflows: Workflow[] }>(`/clinics/${clinicId}/workflows`),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/clinics/${clinicId}/workflows/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: WorkflowStatus }) =>
      api.patch(`/clinics/${clinicId}/workflows/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const workflows = query.data?.workflows ?? []

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('wf.title')}</h1>
          <p className="text-sm text-gray-500">{t('wf.subtitle')}</p>
        </div>
        <ClinicSelect value={clinicId} onChange={setClinicId} label={t('analytics.selectClinic')} />
      </header>

      {!clinicId ? (
        <p className="text-sm text-gray-500">{t('analytics.selectClinicPrompt')}</p>
      ) : editing ? (
        <WorkflowEditor
          clinicId={clinicId}
          workflow={editing === 'new' ? undefined : editing}
          onClose={() => {
            setEditing(null)
            qc.invalidateQueries({ queryKey: key })
          }}
        />
      ) : (
        <>
          <button type="button" onClick={() => setEditing('new')} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}>
            + {t('wf.new')}
          </button>
          {query.isLoading ? (
            <p className="text-sm text-gray-500">{t('common.loading')}</p>
          ) : workflows.length === 0 ? (
            <p className="text-sm text-gray-500">{t('wf.empty')}</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
              {workflows.map((wf) => (
                <li key={wf.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-100">{wf.name}</p>
                    <p className="text-xs text-gray-500">
                      {wf.nodes.length} {t('wf.nodes')} ·{' '}
                      <span className={wf.status === 'active' ? 'text-emerald-600' : 'text-gray-400'}>{t(`wf.status.${wf.status}`)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => toggleMutation.mutate({ id: wf.id, status: wf.status === 'active' ? 'draft' : 'active' })}
                      className={`${btn} border ${wf.status === 'active' ? 'border-gray-300 text-gray-600' : 'border-emerald-300 text-emerald-700'}`}
                    >
                      {wf.status === 'active' ? t('wf.deactivate') : t('wf.activate')}
                    </button>
                    <button type="button" onClick={() => setEditing(wf)} className={`${btn} border border-gray-300 text-gray-700 dark:text-gray-200`}>
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(wf.id)}
                      className={`${btn} border border-red-300 text-red-600`}
                    >
                      {t('common.delete')}
                    </button>
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

function WorkflowEditor({
  clinicId,
  workflow,
  onClose,
}: {
  clinicId: string
  workflow?: Workflow
  onClose: () => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(workflow?.name ?? '')
  const [status, setStatus] = useState<WorkflowStatus>(workflow?.status ?? 'draft')
  const [nodes, setNodes] = useState<WorkflowNode[]>(workflow?.nodes ?? [])
  const [edges, setEdges] = useState<WorkflowEdge[]>(workflow?.edges ?? [])

  const save = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim() || t('wf.untitled'), status, nodes, edges }
      return workflow
        ? api.patch(`/clinics/${clinicId}/workflows/${workflow.id}`, payload)
        : api.post(`/clinics/${clinicId}/workflows`, payload)
    },
    onSuccess: onClose,
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('wf.namePlaceholder')}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={status === 'active'} onChange={(e) => setStatus(e.target.checked ? 'active' : 'draft')} />
          {t('wf.activeToggle')}
        </label>
        <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50`}>
          {t('common.save')}
        </button>
        <button type="button" onClick={onClose} className={`${btn} border border-gray-300 text-gray-700 dark:text-gray-200`}>
          {t('common.cancel')}
        </button>
      </div>
      <p className="text-xs text-gray-500">{t('wf.canvasHint')}</p>
      <WorkflowCanvas
        nodes={nodes}
        edges={edges}
        onChange={(next) => {
          setNodes(next.nodes)
          setEdges(next.edges)
        }}
      />
    </div>
  )
}
