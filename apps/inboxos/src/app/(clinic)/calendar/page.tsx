'use client'

// Screen 2 — AI booking & calendar (Req 9 calendar booking, Req 30 multi-doctor).
//
// The operational day view of the appointments the AI books over WhatsApp, plus
// manual booking / rescheduling / cancellation by the secretary. Multi-doctor: a
// doctor filter scopes the grid and every booking is made against one doctor's
// working hours + free slots. Renders explicit empty / loading / error /
// disconnected (Google Calendar) / day-off / no-slots / success states.
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/shared/api/client'
import { useAuthGuard } from '@/shared/hooks/useAuthGuard'
import { useActiveClinic } from '@/shared/hooks/useActiveClinic'
import { rolesWith } from '@/shared/permissions'
import { useI18n } from '@/shared/hooks/useI18n'
import { SlideOver } from '@/shared/components/SlideOver'
import type {
  AppointmentStatus,
  AppointmentWithNames,
  BookingPatient,
  Doctor,
  Service,
  SlotsResponse,
} from '@/shared/types'

// ── Date helpers (UTC-based so the wall-clock date never drifts by host TZ) ──────
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function formatDay(date: string, lang: 'es' | 'en'): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}
/** HH:MM portion of a stored ISO timestamp — the wall-clock the API booked. */
const timeOf = (iso: string): string => iso.slice(11, 16)

const field =
  'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800'

const STATUS_STYLE: Record<AppointmentStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  cancelled: 'bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  completed: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  no_show: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
}

function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { t } = useI18n()
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {t(`cal.status.${status}`)}
    </span>
  )
}

export default function CalendarPage() {
  const { t, language } = useI18n()
  const { ready } = useAuthGuard(rolesWith('calendar'))
  // Screen 6 — the clinic comes from the shared active-clinic context (the header
  // switcher), so an admin who switches clinic re-scopes the calendar too.
  const { clinicId } = useActiveClinic()
  const [date, setDate] = useState(todayISO())
  const [doctorId, setDoctorId] = useState('') // '' = all doctors

  // A clinic switch invalidates the previously-picked doctor (it belongs to the old
  // clinic), so fall back to the all-doctors view whenever the active clinic changes.
  useEffect(() => {
    setDoctorId('')
  }, [clinicId])
  const [booking, setBooking] = useState(false)
  const [rescheduleId, setRescheduleId] = useState<string | null>(null)

  const doctorsQuery = useQuery({
    queryKey: ['doctors', clinicId],
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ doctors: Doctor[] }>(`/clinics/${clinicId}/doctors`),
  })
  const doctors = useMemo(
    () => (doctorsQuery.data?.doctors ?? []).filter((d) => d.isActive),
    [doctorsQuery.data],
  )

  const from = `${date}T00:00:00`
  const to = `${addDays(date, 1)}T00:00:00`
  const apptQuery = useQuery({
    queryKey: ['appointments', clinicId, date, doctorId],
    enabled: Boolean(clinicId),
    queryFn: () => {
      const q = new URLSearchParams({ from, to })
      if (doctorId) q.set('doctorId', doctorId)
      return api.get<{ appointments: AppointmentWithNames[] }>(`/clinics/${clinicId}/appointments?${q}`)
    },
  })
  const appointments = apptQuery.data?.appointments ?? []

  const selectedDoctor = doctorId ? doctors.find((d) => d.id === doctorId) : undefined
  const rescheduleAppt = rescheduleId ? appointments.find((a) => a.id === rescheduleId) : undefined

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header: title, clinic (admin), doctor filter, date nav, book button */}
      <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold">{t('cal.title')}</h1>
            <p className="text-xs text-gray-400">{t('cal.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              disabled={!clinicId || doctors.length === 0}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
              aria-label={t('cal.doctor')}
            >
              <option value="">{t('cal.allDoctors')}</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setBooking(true)}
              disabled={!clinicId || doctors.length === 0}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {t('cal.book')}
            </button>
          </div>
        </div>

        {/* Date navigation */}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDate((d) => addDays(d, -1))}
            aria-label={t('cal.prev')}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setDate(todayISO())}
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {t('cal.today')}
          </button>
          <button
            type="button"
            onClick={() => setDate((d) => addDays(d, 1))}
            aria-label={t('cal.next')}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            ›
          </button>
          <span className="ml-1 text-sm font-medium capitalize">{formatDay(date, language)}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="ml-auto rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </div>

        {/* Disconnected-calendar banner for the selected doctor */}
        {selectedDoctor && !selectedDoctor.calendarConnected && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <p className="font-semibold">⚠ {t('cal.disconnected')}</p>
            <p className="mt-0.5">{t('cal.disconnectedHint')}</p>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {!clinicId ? (
          <p className="text-sm text-gray-400">{t('cal.selectDoctor')}</p>
        ) : doctorsQuery.isLoading ? (
          <p className="text-sm text-gray-400">{t('cal.loading')}</p>
        ) : doctors.length === 0 ? (
          <p className="text-sm text-gray-400">{t('cal.noDoctors')}</p>
        ) : apptQuery.isLoading ? (
          <p className="text-sm text-gray-400">{t('cal.loading')}</p>
        ) : apptQuery.isError ? (
          <div className="text-sm text-red-600">
            <p>{t('cal.error')}</p>
            <button
              type="button"
              onClick={() => apptQuery.refetch()}
              className="mt-2 rounded-md border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : appointments.length === 0 ? (
          <p className="text-sm text-gray-400">{doctorId ? t('cal.emptyDoctor') : t('cal.empty')}</p>
        ) : (
          <ul className="mx-auto max-w-3xl space-y-2">
            {appointments.map((appt) => (
              <AppointmentRow
                key={appt.id}
                clinicId={clinicId}
                appt={appt}
                onReschedule={() => setRescheduleId(appt.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Booking slide-over */}
      <SlideOver open={booking} onClose={() => setBooking(false)} title={t('cal.book')}>
        <BookingPanel
          clinicId={clinicId}
          doctors={doctors}
          date={date}
          onClose={() => setBooking(false)}
        />
      </SlideOver>

      {/* Reschedule slide-over */}
      <SlideOver
        open={Boolean(rescheduleAppt)}
        onClose={() => setRescheduleId(null)}
        title={t('cal.reschedule')}
      >
        {rescheduleAppt && (
          <ReschedulePanel
            clinicId={clinicId}
            appt={rescheduleAppt}
            onClose={() => setRescheduleId(null)}
          />
        )}
      </SlideOver>
    </div>
  )
}

// ── Appointment row with inline lifecycle actions ───────────────────────────────
function AppointmentRow({
  clinicId,
  appt,
  onReschedule,
}: {
  clinicId: string
  appt: AppointmentWithNames
  onReschedule: () => void
}) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [error, setError] = useState(false)

  const mutate = useMutation({
    mutationFn: (status: AppointmentStatus) =>
      api.patch(`/clinics/${clinicId}/appointments/${appt.id}`, { status }),
    onMutate: () => setError(false),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments', clinicId] }),
    onError: () => setError(true),
  })

  const terminal = appt.status === 'cancelled' || appt.status === 'completed' || appt.status === 'no_show'

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">
              {timeOf(appt.startTime)}–{timeOf(appt.endTime)}
            </span>
            <StatusBadge status={appt.status} />
          </div>
          <p className={`mt-1 font-medium ${appt.status === 'cancelled' ? 'line-through' : ''}`}>
            {appt.patientName || t('cal.unknownPatient')}
          </p>
          <p className="text-xs text-gray-500">
            {appt.doctorName && t('cal.withDoctor', { doctor: appt.doctorName })}
            {appt.serviceName && ` · ${appt.serviceName}`}
          </p>
          {appt.notes && <p className="mt-1 text-xs text-gray-400">{appt.notes}</p>}
        </div>

        {!terminal && (
          <div className="flex shrink-0 flex-col items-stretch gap-1">
            {appt.status === 'pending' && (
              <button
                type="button"
                onClick={() => mutate.mutate('confirmed')}
                disabled={mutate.isPending}
                className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {t('cal.confirmAppt')}
              </button>
            )}
            <button
              type="button"
              onClick={onReschedule}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              {t('cal.reschedule')}
            </button>
            {appt.status === 'confirmed' && (
              <button
                type="button"
                onClick={() => mutate.mutate('completed')}
                disabled={mutate.isPending}
                className="rounded-md border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950"
              >
                {t('cal.markCompleted')}
              </button>
            )}
            <button
              type="button"
              onClick={() => mutate.mutate('no_show')}
              disabled={mutate.isPending}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              {t('cal.markNoShow')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(t('cal.cancelConfirm'))) mutate.mutate('cancelled')
              }}
              disabled={mutate.isPending}
              className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
            >
              {t('cal.cancel')}
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{t('cal.actionError')}</p>}
    </li>
  )
}

// ── Shared free-slot picker ─────────────────────────────────────────────────────
function SlotPicker({
  clinicId,
  doctorId,
  serviceId,
  date,
  value,
  onPick,
}: {
  clinicId: string
  doctorId: string
  serviceId: string
  date: string
  value: string
  onPick: (start: string) => void
}) {
  const { t } = useI18n()
  const query = useQuery({
    queryKey: ['slots', clinicId, doctorId, serviceId, date],
    enabled: Boolean(clinicId && doctorId && date),
    queryFn: () => {
      const q = new URLSearchParams({ doctorId, date })
      if (serviceId) q.set('serviceId', serviceId)
      return api.get<SlotsResponse>(`/clinics/${clinicId}/appointments/slots?${q}`)
    },
  })

  if (!doctorId) return <p className="text-xs text-gray-400">{t('cal.selectDoctor')}</p>
  if (query.isLoading) return <p className="text-xs text-gray-400">{t('cal.slotsLoading')}</p>
  if (query.isError) return <p className="text-xs text-red-600">{t('cal.error')}</p>

  const data = query.data
  if (!data) return null
  if (!data.working) return <p className="text-xs text-gray-400">{t('cal.dayOff')}</p>
  if (data.slots.length === 0) return <p className="text-xs text-gray-400">{t('cal.noSlots')}</p>

  return (
    <div className="space-y-2">
      {!data.calendarConnected && (
        <p className="text-xs text-amber-700 dark:text-amber-400">⚠ {t('cal.disconnectedDoctor')}</p>
      )}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {data.slots.map((s) => (
          <button
            key={s.start}
            type="button"
            onClick={() => onPick(s.start)}
            className={`rounded-md border px-2 py-1.5 text-sm ${
              value === s.start
                ? 'border-indigo-600 bg-indigo-600 font-semibold text-white'
                : 'border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
            }`}
          >
            {s.start}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Booking form ────────────────────────────────────────────────────────────────
function BookingPanel({
  clinicId,
  doctors,
  date: initialDate,
  onClose,
}: {
  clinicId: string
  doctors: Doctor[]
  date: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? '')
  const [serviceId, setServiceId] = useState('')
  const [patientId, setPatientId] = useState('')
  const [date, setDate] = useState(initialDate)
  const [start, setStart] = useState('')
  const [notes, setNotes] = useState('')
  const [errorKey, setErrorKey] = useState<'cal.bookError' | 'cal.slotTaken' | null>(null)

  const servicesQuery = useQuery({
    queryKey: ['services', clinicId],
    queryFn: () => api.get<{ services: Service[] }>(`/clinics/${clinicId}/services`),
  })
  const patientsQuery = useQuery({
    queryKey: ['booking-patients', clinicId],
    queryFn: () => api.get<{ patients: BookingPatient[] }>(`/clinics/${clinicId}/appointments/patients`),
  })
  const services = servicesQuery.data?.services ?? []
  const patients = patientsQuery.data?.patients ?? []

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/clinics/${clinicId}/appointments`, { patientId, doctorId, serviceId: serviceId || undefined, date, start, notes: notes || undefined }),
    onMutate: () => setErrorKey(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments', clinicId] })
      onClose()
    },
    onError: (e) => setErrorKey(e instanceof ApiError && e.status === 409 ? 'cal.slotTaken' : 'cal.bookError'),
  })

  const canSubmit = Boolean(doctorId && patientId && date && start) && !mutation.isPending

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="text-gray-500">{t('cal.doctor')}</span>
        <select
          value={doctorId}
          onChange={(e) => {
            setDoctorId(e.target.value)
            setStart('')
          }}
          className={`${field} mt-1`}
        >
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-gray-500">{t('cal.patient')}</span>
        <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className={`${field} mt-1`}>
          <option value="">{t('cal.selectPatient')}</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName || t('cal.unknownPatient')}
            </option>
          ))}
        </select>
        {patients.length === 0 && !patientsQuery.isLoading && (
          <span className="mt-1 block text-xs text-gray-400">{t('cal.noPatients')}</span>
        )}
      </label>

      <label className="block text-sm">
        <span className="text-gray-500">{t('cal.service')}</span>
        <select
          value={serviceId}
          onChange={(e) => {
            setServiceId(e.target.value)
            setStart('')
          }}
          className={`${field} mt-1`}
        >
          <option value="">{t('cal.noService')}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.durationMinutes} min
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-gray-500">{t('cal.book')}</span>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) {
              setDate(e.target.value)
              setStart('')
            }
          }}
          className={`${field} mt-1`}
        />
      </label>

      <div className="text-sm">
        <span className="text-gray-500">{t('cal.pickSlot')}</span>
        <div className="mt-1">
          <SlotPicker
            clinicId={clinicId}
            doctorId={doctorId}
            serviceId={serviceId}
            date={date}
            value={start}
            onPick={setStart}
          />
        </div>
      </div>

      <label className="block text-sm">
        <span className="text-gray-500">{t('cal.notes')}</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('cal.notesPlaceholder')}
          rows={2}
          className={`${field} mt-1`}
        />
      </label>

      {errorKey && <p className="text-xs text-red-600">{t(errorKey)}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={!canSubmit}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {mutation.isPending ? t('cal.booking') : t('cal.confirm')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {t('cal.bookingClosed')}
        </button>
      </div>
    </div>
  )
}

// ── Reschedule form (doctor + service fixed; pick a new date + slot) ────────────
function ReschedulePanel({
  clinicId,
  appt,
  onClose,
}: {
  clinicId: string
  appt: AppointmentWithNames
  onClose: () => void
}) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [date, setDate] = useState(appt.startTime.slice(0, 10))
  const [start, setStart] = useState('')
  const [errorKey, setErrorKey] = useState<'cal.bookError' | 'cal.slotTaken' | null>(null)

  const mutation = useMutation({
    mutationFn: () => api.patch(`/clinics/${clinicId}/appointments/${appt.id}`, { date, start }),
    onMutate: () => setErrorKey(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments', clinicId] })
      onClose()
    },
    onError: (e) => setErrorKey(e instanceof ApiError && e.status === 409 ? 'cal.slotTaken' : 'cal.bookError'),
  })

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs dark:border-gray-800 dark:bg-gray-800">
        <p className="font-medium">{appt.patientName || t('cal.unknownPatient')}</p>
        <p className="text-gray-500">
          {appt.doctorName && t('cal.withDoctor', { doctor: appt.doctorName })}
          {appt.serviceName && ` · ${appt.serviceName}`}
        </p>
      </div>

      <label className="block text-sm">
        <span className="text-gray-500">{t('cal.book')}</span>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) {
              setDate(e.target.value)
              setStart('')
            }
          }}
          className={`${field} mt-1`}
        />
      </label>

      <div className="text-sm">
        <span className="text-gray-500">{t('cal.pickSlot')}</span>
        <div className="mt-1">
          <SlotPicker
            clinicId={clinicId}
            doctorId={appt.doctorId ?? ''}
            serviceId={appt.serviceId ?? ''}
            date={date}
            value={start}
            onPick={setStart}
          />
        </div>
      </div>

      {errorKey && <p className="text-xs text-red-600">{t(errorKey)}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={!start || mutation.isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {mutation.isPending ? t('cal.rescheduling') : t('cal.reschedule')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {t('cal.bookingClosed')}
        </button>
      </div>
    </div>
  )
}
