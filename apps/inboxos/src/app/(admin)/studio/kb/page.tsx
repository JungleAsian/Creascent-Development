'use client'

// IA Studio — Knowledge Base management. Pick a clinic, then list / add / delete
// its documents and trigger a re-index (re-embed) of the whole clinic KB.
import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, API_BASE } from '@/shared/api/client'
import { authSnapshot } from '@/shared/store/auth'
import { ClinicSelect } from '@/shared/components/ClinicSelect'
import { useI18n } from '@/shared/hooks/useI18n'
import type { DocumentStatus, DocumentType, KnowledgeDocument } from '@/shared/types'

const DOC_TYPES: DocumentType[] = ['faq', 'policy', 'service_info', 'custom']
const DOC_STATUSES: DocumentStatus[] = ['active', 'draft', 'archived']

export default function KbPage() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [clinicId, setClinicId] = useState('')
  const [reembedDone, setReembedDone] = useState(false)

  const key = ['kb', clinicId]
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ documents: KnowledgeDocument[] }>(`/clinics/${clinicId}/kb`),
  })

  const reembedMutation = useMutation({
    mutationFn: () => api.post(`/clinics/${clinicId}/kb/reembed`),
    onSuccess: () => {
      setReembedDone(true)
      setTimeout(() => setReembedDone(false), 3000)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => api.del(`/clinics/${clinicId}/kb/${entryId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const statusMutation = useMutation({
    mutationFn: ({ entryId, status }: { entryId: string; status: DocumentStatus }) =>
      api.patch(`/clinics/${clinicId}/kb/${entryId}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const documents = query.data?.documents ?? []

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('studio.kb.title')}</h1>
        <ClinicSelect value={clinicId} onChange={setClinicId} label={t('studio.usage.selectClinic')} />
      </div>

      {!clinicId ? (
        <p className="text-sm text-gray-400">{t('studio.kb.selectClinic')}</p>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => reembedMutation.mutate()}
              disabled={reembedMutation.isPending}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              {t('studio.kb.reembed')}
            </button>
            {reembedDone && <span className="text-xs text-emerald-600">{t('studio.kb.reembedQueued')}</span>}
          </div>

          <UploadDocForm clinicId={clinicId} onUploaded={() => qc.invalidateQueries({ queryKey: key })} />

          <NewDocForm clinicId={clinicId} />

          {query.isLoading ? (
            <p className="text-sm text-gray-400">{t('common.loading')}</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-gray-400">{t('studio.kb.empty')}</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((d) => (
                <li
                  key={d.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{d.title}</p>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500 dark:bg-gray-800">
                        {d.documentType}
                      </span>
                      <select
                        value={d.status}
                        onChange={(e) =>
                          statusMutation.mutate({ entryId: d.id, status: e.target.value as DocumentStatus })
                        }
                        disabled={statusMutation.isPending}
                        className="rounded border border-gray-300 bg-transparent px-1 py-0.5 text-[10px] uppercase text-gray-500 dark:border-gray-700"
                      >
                        {DOC_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-500">{d.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(t('studio.kb.deleteConfirm'))) deleteMutation.mutate(d.id)
                    }}
                    className="shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                  >
                    {t('common.delete')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

// Gap #33 — document training. Uploads a file (PDF/Word/text/FAQ) which the API
// extracts, chunks and embeds. Uses a raw FormData fetch (the JSON api client can't
// carry multipart) with the bearer token from the auth store.
function UploadDocForm({ clinicId, onUploaded }: { clinicId: string; onUploaded: () => void }) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState(false)

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setMessage(null)
    setError(false)
    try {
      const form = new FormData()
      form.append('file', file)
      const { accessToken } = authSnapshot()
      const res = await fetch(`${API_BASE}/clinics/${clinicId}/kb/upload`, {
        method: 'POST',
        headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
        body: form,
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { chunks: number }
      setMessage(t('studio.kb.uploadSuccess', { n: data.chunks }))
      onUploaded()
    } catch {
      setError(true)
      setMessage(t('studio.kb.uploadError'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <label className="cursor-pointer rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
        {busy ? t('common.loading') : t('studio.kb.upload')}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.text,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={onChange}
          disabled={busy}
          className="hidden"
        />
      </label>
      <span className="text-xs text-gray-400">{t('studio.kb.uploadHint')}</span>
      {message && (
        <span className={`text-xs ${error ? 'text-red-600' : 'text-emerald-600'}`}>{message}</span>
      )}
    </div>
  )
}

function NewDocForm({ clinicId }: { clinicId: string }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [documentType, setDocumentType] = useState<DocumentType>('faq')

  const mutation = useMutation({
    mutationFn: () => api.post(`/clinics/${clinicId}/kb`, { title, content, documentType }),
    onSuccess: () => {
      setTitle('')
      setContent('')
      setDocumentType('faq')
      qc.invalidateQueries({ queryKey: ['kb', clinicId] })
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
      <div className="flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('studio.kb.docTitle')}
          className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <select
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value as DocumentType)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          {DOC_TYPES.map((dt) => (
            <option key={dt} value={dt}>
              {dt}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        placeholder={t('studio.kb.content')}
        className="w-full resize-none rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
      />
      <button
        type="submit"
        disabled={mutation.isPending || !title.trim() || !content.trim()}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {t('studio.kb.add')}
      </button>
    </form>
  )
}
