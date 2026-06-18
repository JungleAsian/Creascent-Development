'use client'

// IA Studio — Doctor management (Gap #32). Pick a clinic, then list / add / delete
// its doctors. Each doctor can carry their own Google Calendar credentials so the
// booking flow checks and books against that doctor's calendar.
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { ClinicSelect } from '@/shared/components/ClinicSelect'
import { useI18n } from '@/shared/hooks/useI18n'
import type { Doctor } from '@/shared/types'

export default function DoctorsPage() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [clinicId, setClinicId] = useState('')

  const key = ['doctors', clinicId]
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ doctors: Doctor[] }>(`/clinics/${clinicId}/doctors`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/clinics/${clinicId}/doctors/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const doctors = query.data?.doctors ?? []

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('studio.doctors.title')}</h1>
        <ClinicSelect value={clinicId} onChange={setClinicId} label={t('analytics.selectClinic')} />
      </div>

      {!clinicId ? (
        <p className="text-sm text-gray-400">{t('studio.doctors.selectClinic')}</p>
      ) : (
        <>
          <NewDoctorForm clinicId={clinicId} />

          {query.isLoading ? (
            <p className="text-sm text-gray-400">{t('common.loading')}</p>
          ) : doctors.length === 0 ? (
            <p className="text-sm text-gray-400">{t('studio.doctors.empty')}</p>
          ) : (
            <ul className="space-y-2">
              {doctors.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{doc.name}</p>
                    {doc.specialty && <p className="text-xs text-gray-500">{doc.specialty}</p>}
                    <p className="mt-1 text-xs">
                      <span
                        className={
                          doc.calendarConnected
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-gray-400'
                        }
                      >
                        {doc.calendarConnected ? t('studio.doctors.connected') : t('studio.doctors.notConnected')}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(t('studio.doctors.deleteConfirm'))) deleteMutation.mutate(doc.id)
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

function NewDoctorForm({ clinicId }: { clinicId: string }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [googleCalendarId, setGoogleCalendarId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/clinics/${clinicId}/doctors`, {
        name,
        specialty: specialty || undefined,
        googleCalendarId: googleCalendarId || undefined,
        googleCalendarAccessToken: accessToken || undefined,
        googleCalendarRefreshToken: refreshToken || undefined,
      }),
    onSuccess: () => {
      setName('')
      setSpecialty('')
      setGoogleCalendarId('')
      setAccessToken('')
      setRefreshToken('')
      qc.invalidateQueries({ queryKey: ['doctors', clinicId] })
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) mutation.mutate()
  }

  const field = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800'

  return (
    <form
      onSubmit={onSubmit}
      className="mb-6 grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-2 dark:border-gray-800 dark:bg-gray-900"
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('studio.doctors.name')} className={field} />
      <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder={t('studio.doctors.specialty')} className={field} />
      <input value={googleCalendarId} onChange={(e) => setGoogleCalendarId(e.target.value)} placeholder={t('studio.doctors.calendarId')} className={field} />
      <div className="hidden sm:block" />
      <input value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder={t('studio.doctors.accessToken')} className={field} />
      <input value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} placeholder={t('studio.doctors.refreshToken')} className={field} />
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={mutation.isPending || !name.trim()}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {t('studio.doctors.add')}
        </button>
      </div>
    </form>
  )
}
