'use client'

// IA Studio — Doctor management (Req 30, Gap #32). Pick a clinic, then list / add /
// edit / delete its doctors. Each doctor can carry their own Google Calendar
// credentials (so the booking flow checks and books against that doctor's calendar)
// AND their own weekly working hours (so the bot only offers slots when that doctor
// actually works).
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { ClinicSelect } from '@/shared/components/ClinicSelect'
import { useI18n } from '@/shared/hooks/useI18n'
import type { Doctor, DoctorAvailability, Weekday } from '@/shared/types'

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export default function DoctorsPage() {
  const { t } = useI18n()
  const [clinicId, setClinicId] = useState('')

  const key = ['doctors', clinicId]
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ doctors: Doctor[] }>(`/clinics/${clinicId}/doctors`),
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
                <DoctorRow key={doc.id} clinicId={clinicId} doctor={doc} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

const field =
  'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800'

/** Human summary of a doctor's working hours, e.g. "Mon, Tue, Fri". */
function hoursSummary(availability: DoctorAvailability, t: (k: string) => string): string {
  const days = WEEKDAYS.filter((d) => (availability[d]?.length ?? 0) > 0)
  if (days.length === 0) return t('studio.doctors.noHours')
  return days.map((d) => t(`studio.doctors.day.${d}`)).join(', ')
}

function DoctorRow({ clinicId, doctor }: { clinicId: string; doctor: Doctor }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => api.del(`/clinics/${clinicId}/doctors/${doctor.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doctors', clinicId] }),
  })

  if (editing) {
    return (
      <li className="rounded-lg border border-indigo-200 bg-white p-3 dark:border-indigo-900 dark:bg-gray-900">
        <EditDoctorForm clinicId={clinicId} doctor={doctor} onDone={() => setEditing(false)} />
      </li>
    )
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="min-w-0">
        <p className="font-medium">
          {doctor.name}
          {!doctor.isActive && (
            <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {t('studio.doctors.inactive')}
            </span>
          )}
        </p>
        {doctor.specialty && <p className="text-xs text-gray-500">{doctor.specialty}</p>}
        <p className="mt-1 text-xs text-gray-500">
          {t('studio.doctors.hours')}: {hoursSummary(doctor.availableDays, t)}
        </p>
        <p className="mt-1 text-xs">
          <span
            className={
              doctor.calendarConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'
            }
          >
            {doctor.calendarConnected ? t('studio.doctors.connected') : t('studio.doctors.notConnected')}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {t('common.edit')}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(t('studio.doctors.deleteConfirm'))) deleteMutation.mutate()
          }}
          className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
        >
          {t('common.delete')}
        </button>
      </div>
    </li>
  )
}

/** A 7-row weekly hours editor. One start/end range per day; unchecked = day off. */
function WeeklyHoursEditor({
  value,
  onChange,
}: {
  value: DoctorAvailability
  onChange: (next: DoctorAvailability) => void
}) {
  const { t } = useI18n()

  function setDay(day: Weekday, enabled: boolean, start: string, end: string) {
    const next: DoctorAvailability = { ...value }
    if (enabled) next[day] = [{ start, end }]
    else delete next[day]
    onChange(next)
  }

  return (
    <div className="rounded-md border border-gray-200 p-2 dark:border-gray-700">
      <p className="mb-2 text-xs font-medium text-gray-500">{t('studio.doctors.workingHours')}</p>
      <div className="space-y-1">
        {WEEKDAYS.map((day) => {
          const range = value[day]?.[0]
          const enabled = Boolean(range)
          const start = range?.start ?? '09:00'
          const end = range?.end ?? '17:00'
          return (
            <div key={day} className="flex items-center gap-2 text-sm">
              <label className="flex w-28 items-center gap-2">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setDay(day, e.target.checked, start, end)}
                />
                {t(`studio.doctors.day.${day}`)}
              </label>
              <input
                type="time"
                value={start}
                disabled={!enabled}
                onChange={(e) => setDay(day, true, e.target.value, end)}
                className="rounded-md border border-gray-300 px-1.5 py-1 text-sm disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800"
              />
              <span className="text-gray-400">–</span>
              <input
                type="time"
                value={end}
                disabled={!enabled}
                onChange={(e) => setDay(day, true, start, e.target.value)}
                className="rounded-md border border-gray-300 px-1.5 py-1 text-sm disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-gray-400">{t('studio.doctors.hoursHint')}</p>
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
  const [availableDays, setAvailableDays] = useState<DoctorAvailability>({})

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/clinics/${clinicId}/doctors`, {
        name,
        specialty: specialty || undefined,
        googleCalendarId: googleCalendarId || undefined,
        googleCalendarAccessToken: accessToken || undefined,
        googleCalendarRefreshToken: refreshToken || undefined,
        availableDays,
      }),
    onSuccess: () => {
      setName('')
      setSpecialty('')
      setGoogleCalendarId('')
      setAccessToken('')
      setRefreshToken('')
      setAvailableDays({})
      qc.invalidateQueries({ queryKey: ['doctors', clinicId] })
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) mutation.mutate()
  }

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
        <WeeklyHoursEditor value={availableDays} onChange={setAvailableDays} />
      </div>
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

function EditDoctorForm({
  clinicId,
  doctor,
  onDone,
}: {
  clinicId: string
  doctor: Doctor
  onDone: () => void
}) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [name, setName] = useState(doctor.name)
  const [specialty, setSpecialty] = useState(doctor.specialty ?? '')
  const [googleCalendarId, setGoogleCalendarId] = useState(doctor.googleCalendarId ?? '')
  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [isActive, setIsActive] = useState(doctor.isActive)
  const [availableDays, setAvailableDays] = useState<DoctorAvailability>(doctor.availableDays ?? {})

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/clinics/${clinicId}/doctors/${doctor.id}`, {
        name,
        specialty: specialty || undefined,
        googleCalendarId: googleCalendarId || undefined,
        googleCalendarAccessToken: accessToken || undefined,
        googleCalendarRefreshToken: refreshToken || undefined,
        availableDays,
        isActive,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doctors', clinicId] })
      onDone()
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) mutation.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('studio.doctors.name')} className={field} />
      <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder={t('studio.doctors.specialty')} className={field} />
      <input value={googleCalendarId} onChange={(e) => setGoogleCalendarId(e.target.value)} placeholder={t('studio.doctors.calendarId')} className={field} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        {t('studio.doctors.active')}
      </label>
      <input value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder={t('studio.doctors.accessTokenReplace')} className={field} />
      <input value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} placeholder={t('studio.doctors.refreshTokenReplace')} className={field} />
      <div className="sm:col-span-2">
        <WeeklyHoursEditor value={availableDays} onChange={setAvailableDays} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={mutation.isPending || !name.trim()}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {t('common.save')}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}
