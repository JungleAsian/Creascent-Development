'use client'

// Screen 7 — Knowledge base editor (IA Studio). Pick a clinic, then create / edit /
// categorise its entries, upload source documents, and watch each entry's TRAINING
// STATE (is it indexed and retrievable by the bot?) and SOURCE CONFIDENCE (how much
// we trust the text given where it came from). Re-index re-embeds the whole clinic KB.
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, API_BASE } from '@/shared/api/client'
import { authSnapshot } from '@/shared/store/auth'
import { ClinicSelect } from '@/shared/components/ClinicSelect'
import { useI18n } from '@/shared/hooks/useI18n'
import { trainingInfo, sourceInfo, needsReview, type TrainingState } from '@/shared/kbTraining'
import type { TranslationKey } from '@/shared/i18n'
import type { DocumentStatus, DocumentType, Doctor, KnowledgeDocument } from '@/shared/types'

const DOC_TYPES: DocumentType[] = ['faq', 'policy', 'service_info', 'custom']
const DOC_STATUSES: DocumentStatus[] = ['active', 'draft', 'archived']

// Type-safe label maps (t() only accepts known keys, so dynamic lookups go through these).
const TYPE_LABEL: Record<DocumentType, TranslationKey> = {
  faq: 'studio.kb.typeFaq',
  policy: 'studio.kb.typePolicy',
  service_info: 'studio.kb.typeService_info',
  custom: 'studio.kb.typeCustom',
}
const STATUS_LABEL: Record<DocumentStatus, TranslationKey> = {
  active: 'studio.kb.statusActive',
  draft: 'studio.kb.statusDraft',
  archived: 'studio.kb.statusArchived',
}
const STATE_LABEL: Record<TrainingState, TranslationKey> = {
  trained: 'studio.kb.stateTrained',
  training: 'studio.kb.stateTraining',
  queued: 'studio.kb.stateQueued',
  not_indexed: 'studio.kb.stateNotIndexed',
}
const STATE_CLASS: Record<TrainingState, string> = {
  trained:
    'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  training:
    'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300',
  queued:
    'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  not_indexed:
    'border-gray-300 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400',
}

export default function KbPage() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [clinicId, setClinicId] = useState('')
  const [reembedDone, setReembedDone] = useState(false)
  const [category, setCategory] = useState<DocumentType | 'all'>('all')

  const key = ['kb', clinicId]
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ documents: KnowledgeDocument[] }>(`/clinics/${clinicId}/kb`),
  })

  // Per-doctor FAQs (Req 30): the clinic's doctors populate the scope selectors.
  const doctorsQuery = useQuery({
    queryKey: ['doctors', clinicId],
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ doctors: Doctor[] }>(`/clinics/${clinicId}/doctors`),
  })
  const doctors = doctorsQuery.data?.doctors ?? []

  const reembedMutation = useMutation({
    mutationFn: () => api.post(`/clinics/${clinicId}/kb/reembed`),
    onSuccess: () => {
      setReembedDone(true)
      setTimeout(() => setReembedDone(false), 3000)
    },
  })

  const documents = query.data?.documents ?? []
  const pendingReview = documents.filter((d) => d.status === 'draft').length
  // Active entries whose text came from a scan (OCR) — low confidence, worth a look.
  const lowConfidence = documents.filter(
    (d) => d.status !== 'draft' && needsReview(d),
  ).length
  const visible = useMemo(
    () => (category === 'all' ? documents : documents.filter((d) => d.documentType === category)),
    [documents, category],
  )

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-bold">{t('studio.kb.title')}</h1>
          {clinicId && !query.isLoading && (
            <span className="text-xs text-gray-400">
              {t('studio.kb.docCount', { n: documents.length })}
            </span>
          )}
        </div>
        <ClinicSelect value={clinicId} onChange={setClinicId} label={t('studio.usage.selectClinic')} />
      </div>

      {!clinicId ? (
        <p className="text-sm text-gray-400">{t('studio.kb.selectClinic')}</p>
      ) : query.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {t('common.error')}{' '}
          <button type="button" onClick={() => query.refetch()} className="font-medium underline">
            {t('common.retry')}
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => reembedMutation.mutate()}
              disabled={reembedMutation.isPending}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              {t('studio.kb.reembed')}
            </button>
            {reembedDone && <span className="text-xs text-emerald-600">{t('studio.kb.reembedQueued')}</span>}
            <span
              className="ml-auto cursor-help text-[11px] text-gray-400"
              title={t('studio.kb.confidenceHint')}
            >
              ⓘ {t('studio.kb.confidenceHigh')} · {t('studio.kb.confidenceMedium')} ·{' '}
              {t('studio.kb.confidenceLow')}
            </span>
          </div>

          <UploadDocForm clinicId={clinicId} onUploaded={() => qc.invalidateQueries({ queryKey: key })} />

          {pendingReview > 0 && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              {t('studio.kb.reviewBanner', { n: pendingReview })}
            </div>
          )}
          {lowConfidence > 0 && (
            <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {t('studio.kb.reviewBannerLow', { n: lowConfidence })}
            </div>
          )}

          <NewDocForm clinicId={clinicId} doctors={doctors} />

          {/* Categories (Req: document categories) — filter the list by entry type. */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            <CategoryTab active={category === 'all'} onClick={() => setCategory('all')}>
              {t('studio.kb.allCategories')}
            </CategoryTab>
            {DOC_TYPES.map((dt) => (
              <CategoryTab key={dt} active={category === dt} onClick={() => setCategory(dt)}>
                {t(TYPE_LABEL[dt])}
              </CategoryTab>
            ))}
          </div>

          {query.isLoading ? (
            <ul className="space-y-2" aria-busy>
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="h-20 animate-pulse rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900"
                />
              ))}
            </ul>
          ) : documents.length === 0 ? (
            <p className="text-sm text-gray-400">{t('studio.kb.empty')}</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-gray-400">{t('studio.kb.noneInCategory')}</p>
          ) : (
            <ul className="space-y-2">
              {visible.map((d) => (
                <DocRow key={d.id} doc={d} clinicId={clinicId} doctors={doctors} queryKey={key} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function CategoryTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950 dark:text-indigo-300'
          : 'border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
      }`}
    >
      {children}
    </button>
  )
}

// One document — view mode (badges + scope controls) with an inline edit form.
function DocRow({
  doc,
  clinicId,
  doctors,
  queryKey,
}: {
  doc: KnowledgeDocument
  clinicId: string
  doctors: Doctor[]
  queryKey: (string | undefined)[]
}) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const invalidate = () => qc.invalidateQueries({ queryKey })

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/clinics/${clinicId}/kb/${doc.id}`, body),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({
    mutationFn: () => api.del(`/clinics/${clinicId}/kb/${doc.id}`),
    onSuccess: invalidate,
  })

  const train = trainingInfo(doc)
  const src = sourceInfo(doc)
  const stateHint =
    train.state === 'trained'
      ? t('studio.kb.stateTrainedHint')
      : train.state === 'training'
        ? t('studio.kb.stateTrainingHint', { n: train.embeddedCount, total: train.chunkCount })
        : train.state === 'queued'
          ? t('studio.kb.stateQueuedHint')
          : t('studio.kb.stateNotIndexedHint')

  if (editing) {
    return (
      <li className="rounded-lg border border-indigo-300 bg-white p-3 dark:border-indigo-800 dark:bg-gray-900">
        <EditDocForm
          doc={doc}
          saving={patch.isPending}
          error={patch.isError}
          onCancel={() => setEditing(false)}
          onSave={(body) => patch.mutate(body, { onSuccess: () => setEditing(false) })}
        />
      </li>
    )
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="font-medium">{doc.title}</p>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500 dark:bg-gray-800">
            {t(TYPE_LABEL[doc.documentType])}
          </span>
          {/* Source confidence */}
          <ConfidenceBadge source={src.source} confidence={src.confidence} />
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {/* Training state + progress */}
          <span
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${STATE_CLASS[train.state]}`}
            title={stateHint}
          >
            {t(STATE_LABEL[train.state])}
            {train.chunkCount > 0 && (
              <span className="opacity-70">
                {train.embeddedCount}/{train.chunkCount}
              </span>
            )}
          </span>
          {train.state === 'training' && (
            <span className="h-1 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <span
                className="block h-full bg-indigo-500"
                style={{ width: `${Math.round(train.progress * 100)}%` }}
              />
            </span>
          )}

          {/* Status */}
          <select
            value={doc.status}
            onChange={(e) => patch.mutate({ status: e.target.value as DocumentStatus })}
            disabled={patch.isPending}
            className="rounded border border-gray-300 bg-transparent px-1 py-0.5 text-[10px] text-gray-500 dark:border-gray-700"
          >
            {DOC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(STATUS_LABEL[s])}
              </option>
            ))}
          </select>

          {/* Per-doctor scope (Req 30) */}
          <select
            value={doc.metadata?.doctorId ?? ''}
            onChange={(e) => patch.mutate({ doctorId: e.target.value || null })}
            disabled={patch.isPending || doctors.length === 0}
            title={t('studio.kb.doctorHint')}
            className="rounded border border-gray-300 bg-transparent px-1 py-0.5 text-[10px] text-gray-500 dark:border-gray-700"
          >
            <option value="">{t('studio.kb.allDoctors')}</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-xs text-gray-500">{doc.content}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {doc.status === 'draft' && (
          <button
            type="button"
            onClick={() => patch.mutate({ status: 'active' })}
            disabled={patch.isPending}
            className="rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-900 dark:hover:bg-emerald-950"
          >
            {t('studio.kb.approve')}
          </button>
        )}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {t('studio.kb.edit')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(t('studio.kb.deleteConfirm'))) deleteMutation.mutate()
            }}
            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
          >
            {t('common.delete')}
          </button>
        </div>
      </div>
    </li>
  )
}

function ConfidenceBadge({
  source,
  confidence,
}: {
  source: 'manual' | 'document' | 'ocr'
  confidence: 'high' | 'medium' | 'low'
}) {
  const { t } = useI18n()
  const sourceLabel: Record<typeof source, TranslationKey> = {
    manual: 'studio.kb.sourceManual',
    document: 'studio.kb.sourceDocument',
    ocr: 'studio.kb.sourceOcr',
  }
  const confLabel: Record<typeof confidence, TranslationKey> = {
    high: 'studio.kb.confidenceHigh',
    medium: 'studio.kb.confidenceMedium',
    low: 'studio.kb.confidenceLow',
  }
  const cls =
    confidence === 'high'
      ? 'border-emerald-300 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
      : confidence === 'medium'
        ? 'border-amber-300 text-amber-700 dark:border-amber-900 dark:text-amber-300'
        : 'border-red-300 text-red-700 dark:border-red-900 dark:text-red-300'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${cls}`}
      title={`${t(confLabel[confidence])} · ${t('studio.kb.confidenceHint')}`}
    >
      {t(sourceLabel[source])}
    </span>
  )
}

// Inline entry editor — edit an existing document's title / content / category.
function EditDocForm({
  doc,
  saving,
  error,
  onCancel,
  onSave,
}: {
  doc: KnowledgeDocument
  saving: boolean
  error: boolean
  onCancel: () => void
  onSave: (body: Record<string, unknown>) => void
}) {
  const { t } = useI18n()
  const [title, setTitle] = useState(doc.title)
  const [content, setContent] = useState(doc.content)
  const [documentType, setDocumentType] = useState<DocumentType>(doc.documentType)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    const body: Record<string, unknown> = {}
    if (title !== doc.title) body.title = title
    if (content !== doc.content) body.content = content
    if (documentType !== doc.documentType) body.documentType = documentType
    // Nothing changed → just close, don't fire an empty PATCH (the API rejects it).
    if (Object.keys(body).length === 0) return onCancel()
    onSave(body)
  }

  return (
    <form onSubmit={submit} className="space-y-2">
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
              {t(TYPE_LABEL[dt])}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        placeholder={t('studio.kb.content')}
        className="w-full resize-y rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !title.trim() || !content.trim()}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {t('studio.kb.save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {t('studio.kb.cancel')}
        </button>
        {error && <span className="text-xs text-red-600">{t('studio.kb.saveError')}</span>}
      </div>
    </form>
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
          accept=".pdf,.docx,.txt,.md,.text,.png,.jpg,.jpeg,.webp,.tif,.tiff,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
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

function NewDocForm({ clinicId, doctors }: { clinicId: string; doctors: Doctor[] }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [documentType, setDocumentType] = useState<DocumentType>('faq')
  const [doctorId, setDoctorId] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/clinics/${clinicId}/kb`, { title, content, documentType, doctorId: doctorId || null }),
    onSuccess: () => {
      setTitle('')
      setContent('')
      setDocumentType('faq')
      setDoctorId('')
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
              {t(TYPE_LABEL[dt])}
            </option>
          ))}
        </select>
        {doctors.length > 0 && (
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            title={t('studio.kb.doctorHint')}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="">{t('studio.kb.allDoctors')}</option>
            {doctors.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.name}
              </option>
            ))}
          </select>
        )}
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
