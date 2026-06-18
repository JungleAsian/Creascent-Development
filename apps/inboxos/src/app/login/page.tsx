'use client'

// Login screen. Posts credentials to /auth/login, stores the session (tokens +
// user + panel language) and routes to the user's default surface.
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError } from '@/shared/api/client'
import { useAuthStore } from '@/shared/store/auth'
import { useI18n } from '@/shared/hooks/useI18n'
import { LanguageToggle } from '@/shared/components/LanguageToggle'
import type { AuthUser, PanelLanguage } from '@/shared/types'

interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser & { panelLanguage?: PanelLanguage }
}

export default function LoginPage() {
  const router = useRouter()
  const { t } = useI18n()
  const setSession = useAuthStore((s) => s.setSession)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await api.post<LoginResponse>('/auth/login', { email, password }, { anonymous: true })
      setSession({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        user: { id: res.user.id, email: res.user.email, role: res.user.role, clinicId: res.user.clinicId },
        language: res.user.panelLanguage,
      })
      router.replace(res.user.role === 'ia_studio_admin' ? '/studio' : '/inbox')
    } catch (err) {
      setError(err instanceof ApiError ? t('login.error') : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4 dark:bg-gray-950">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{t('login.title')}</h1>
            <p className="text-sm text-gray-500">{t('login.subtitle')}</p>
          </div>
          <LanguageToggle />
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              {t('login.email')}
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-800"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              {t('login.password')}
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-800"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? t('login.loading') : t('login.submit')}
          </button>
        </form>
      </div>
    </main>
  )
}
