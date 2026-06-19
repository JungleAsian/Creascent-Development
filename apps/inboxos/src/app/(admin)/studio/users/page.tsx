'use client'

// IA Studio — Clinic user management (Req 1). Pick a clinic, then list / add /
// edit / delete its panel users and assign their role (secretary / doctor /
// clinic admin). The logged-in admin cannot demote, deactivate or delete their
// own account — those guards are enforced on the API too.
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/shared/api/client'
import { ClinicSelect } from '@/shared/components/ClinicSelect'
import { useI18n } from '@/shared/hooks/useI18n'
import { useAuthStore } from '@/shared/store/auth'
import type { AssignableRole, ClinicUser, ClinicUserStatus, PanelLanguage } from '@/shared/types'

const ROLES: AssignableRole[] = ['secretary', 'doctor', 'clinic_admin']
const STATUSES: ClinicUserStatus[] = ['active', 'inactive', 'invited']

export default function UsersPage() {
  const { t } = useI18n()
  const [clinicId, setClinicId] = useState('')

  const key = ['clinic-users', clinicId]
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(clinicId),
    queryFn: () => api.get<{ users: ClinicUser[] }>(`/clinics/${clinicId}/users`),
  })

  const users = query.data?.users ?? []

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('studio.users.title')}</h1>
        <ClinicSelect value={clinicId} onChange={setClinicId} label={t('studio.usage.selectClinic')} />
      </div>

      {!clinicId ? (
        <p className="text-sm text-gray-400">{t('studio.users.selectClinic')}</p>
      ) : (
        <>
          <NewUserForm clinicId={clinicId} />

          {query.isLoading ? (
            <p className="text-sm text-gray-400">{t('common.loading')}</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-gray-400">{t('studio.users.empty')}</p>
          ) : (
            <ul className="space-y-2">
              {users.map((u) => (
                <UserRow key={u.id} clinicId={clinicId} user={u} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const { t } = useI18n()
  return (
    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
      {t(`studio.users.role.${role}`)}
    </span>
  )
}

function StatusBadge({ status }: { status: ClinicUserStatus }) {
  const { t } = useI18n()
  const tone =
    status === 'active'
      ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
      : status === 'invited'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{t(`studio.users.status.${status}`)}</span>
}

function UserRow({ clinicId, user }: { clinicId: string; user: ClinicUser }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const selfId = useAuthStore((s) => s.user?.id)
  const isSelf = selfId === user.id
  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState(user.fullName ?? '')
  const [email, setEmail] = useState(user.email)
  const [role, setRole] = useState<AssignableRole>(
    ROLES.includes(user.role as AssignableRole) ? (user.role as AssignableRole) : 'secretary',
  )
  const [status, setStatus] = useState<ClinicUserStatus>(user.status)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const updateMutation = useMutation({
    mutationFn: () =>
      api.patch(`/clinics/${clinicId}/users/${user.id}`, {
        fullName: fullName.trim() || undefined,
        email,
        role,
        status,
        ...(password ? { password } : {}),
      }),
    onSuccess: () => {
      setEditing(false)
      setPassword('')
      setError('')
      qc.invalidateQueries({ queryKey: ['clinic-users', clinicId] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : t('common.error')),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.del(`/clinics/${clinicId}/users/${user.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic-users', clinicId] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : t('common.error')),
  })

  function startEdit() {
    setFullName(user.fullName ?? '')
    setEmail(user.email)
    setRole(ROLES.includes(user.role as AssignableRole) ? (user.role as AssignableRole) : 'secretary')
    setStatus(user.status)
    setPassword('')
    setError('')
    setEditing(true)
  }

  if (editing) {
    return (
      <li className="space-y-2 rounded-lg border border-indigo-200 bg-white p-3 dark:border-indigo-900 dark:bg-gray-900">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={t('studio.users.fullName')}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('studio.users.email')}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AssignableRole)}
            disabled={isSelf}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 disabled:opacity-60"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`studio.users.role.${r}`)}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ClinicUserStatus)}
            disabled={isSelf}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 disabled:opacity-60"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`studio.users.status.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('studio.users.newPassword')}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={updateMutation.isPending || !email.trim()}
            onClick={() => updateMutation.mutate()}
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
        <p className="font-medium">
          {user.fullName || user.email}
          {isSelf && <span className="ml-2 text-xs text-gray-400">{t('studio.users.you')}</span>}
        </p>
        <p className="mt-0.5 truncate text-xs text-gray-500">{user.email}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <RoleBadge role={user.role} />
          <StatusBadge status={user.status} />
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={startEdit}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {t('common.edit')}
        </button>
        {!isSelf && (
          <button
            type="button"
            onClick={() => {
              if (confirm(t('studio.users.deleteConfirm'))) deleteMutation.mutate()
            }}
            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
          >
            {t('common.delete')}
          </button>
        )}
      </div>
    </li>
  )
}

function NewUserForm({ clinicId }: { clinicId: string }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AssignableRole>('secretary')
  const [language, setLanguage] = useState<PanelLanguage>('es')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/clinics/${clinicId}/users`, {
        fullName: fullName.trim() || undefined,
        email,
        password: password || undefined,
        role,
        panelLanguage: language,
      }),
    onSuccess: () => {
      setFullName('')
      setEmail('')
      setPassword('')
      setRole('secretary')
      setError('')
      qc.invalidateQueries({ queryKey: ['clinic-users', clinicId] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : t('common.error')),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (email.trim()) mutation.mutate()
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-6 space-y-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
    >
      <p className="text-sm font-semibold">{t('studio.users.add')}</p>
      <input
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder={t('studio.users.fullName')}
        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t('studio.users.email')}
        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t('studio.users.passwordOptional')}
        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AssignableRole)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`studio.users.role.${r}`)}
            </option>
          ))}
        </select>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as PanelLanguage)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <option value="es">{t('studio.users.lang.es')}</option>
          <option value="en">{t('studio.users.lang.en')}</option>
        </select>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={mutation.isPending || !email.trim()}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {t('studio.users.add')}
      </button>
    </form>
  )
}
