'use client'

// IA Studio — Clinic Management. List every clinic, create new ones, and edit a
// clinic's name / plan / status / timezone inline.
import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/shared/api/client'
import { useClinics } from '@/shared/components/ClinicSelect'
import { useI18n } from '@/shared/hooks/useI18n'
import type { Clinic, ClinicPlan, ClinicStatus } from '@/shared/types'

const PLANS: ClinicPlan[] = ['starter', 'pro', 'enterprise']
const STATUSES: ClinicStatus[] = ['active', 'suspended', 'cancelled']

export default function ClinicsPage() {
  const { t } = useI18n()
  const { data, isLoading } = useClinics()
  const clinics = data?.clinics ?? []

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-xl font-bold">{t('studio.clinics.title')}</h1>

      <NewClinicForm />

      {isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : clinics.length === 0 ? (
        <p className="text-sm text-gray-400">{t('studio.clinics.empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2">{t('studio.clinics.name')}</th>
                <th className="px-3 py-2">{t('studio.clinics.slug')}</th>
                <th className="px-3 py-2">{t('studio.clinics.plan')}</th>
                <th className="px-3 py-2">{t('studio.clinics.status')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {clinics.map((c) => (
                <ClinicRow key={c.id} clinic={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NewClinicForm() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [plan, setPlan] = useState<ClinicPlan>('starter')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => api.post('/clinics', { name, slug, plan }),
    onSuccess: () => {
      setName('')
      setSlug('')
      setPlan('starter')
      setError(null)
      qc.invalidateQueries({ queryKey: ['clinics'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : t('common.error')),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (name.trim() && slug.trim()) mutation.mutate()
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
    >
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('studio.clinics.name')}</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('studio.clinics.slug')}</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="clinica-demo"
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('studio.clinics.plan')}</label>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value as ClinicPlan)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={mutation.isPending || !name.trim() || !slug.trim()}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {t('studio.clinics.create')}
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  )
}

function ClinicRow({ clinic }: { clinic: Clinic }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [name, setName] = useState(clinic.name)
  const [plan, setPlan] = useState<ClinicPlan>(clinic.plan)
  const [status, setStatus] = useState<ClinicStatus>(clinic.status)

  const dirty = name !== clinic.name || plan !== clinic.plan || status !== clinic.status

  const mutation = useMutation({
    mutationFn: () => api.patch(`/clinics/${clinic.id}`, { name, plan, status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinics'] }),
  })

  return (
    <tr className="border-t border-gray-100 dark:border-gray-800">
      <td className="px-3 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-sm hover:border-gray-300 focus:border-indigo-500 dark:hover:border-gray-700"
        />
      </td>
      <td className="px-3 py-2 text-gray-400">{clinic.slug}</td>
      <td className="px-3 py-2">
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value as ClinicPlan)}
          className="rounded-md border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-800"
        >
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ClinicStatus)}
          className="rounded-md border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-800"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={!dirty || mutation.isPending}
          className="rounded-md bg-gray-800 px-3 py-1 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-40 dark:bg-gray-700"
        >
          {t('common.save')}
        </button>
      </td>
    </tr>
  )
}
