// API client — a thin fetch wrapper that injects the bearer token, transparently
// refreshes a single time on 401, and redirects to /login when refresh fails.
import { authSnapshot, useAuthStore } from '../store/auth'

function resolveApiBase() {
  const configured = process.env['NEXT_PUBLIC_API_URL']?.replace(/\/$/, '')
  if (typeof window === 'undefined') return configured ?? 'http://localhost:3001'
  if (configured && !/^http:\/\/(localhost|127\.0\.0\.1):3001$/.test(configured)) return configured
  return `${window.location.protocol}//${window.location.hostname}:3001`
}

const API_BASE = resolveApiBase()

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function redirectToLogin() {
  useAuthStore.getState().logout()
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

// Single in-flight refresh shared by concurrent 401s, so we never stampede /auth/refresh.
let refreshing: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = authSnapshot()
  if (!refreshToken) return null
  if (!refreshing) {
    refreshing = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return null
        const data = (await res.json()) as { accessToken?: string }
        if (!data.accessToken) return null
        useAuthStore.getState().setAccessToken(data.accessToken)
        return data.accessToken
      })
      .catch(() => null)
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

export interface ApiOptions {
  method?: string
  body?: unknown
  /** Skip the bearer header (used by the login call). */
  anonymous?: boolean
}

async function request<T>(path: string, opts: ApiOptions = {}, isRetry = false): Promise<T> {
  const { accessToken } = authSnapshot()
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (!opts.anonymous && accessToken) headers['authorization'] = `Bearer ${accessToken}`

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

  if (res.status === 401 && !opts.anonymous && !isRetry) {
    const next = await refreshAccessToken()
    if (next) return request<T>(path, opts, true)
    redirectToLogin()
    throw new ApiError(401, 'Unauthorized')
  }

  if (!res.ok) {
    let message = res.statusText
    try {
      const data = (await res.json()) as { error?: string }
      if (data?.error) message = data.error
    } catch {
      // non-JSON error body — keep the status text
    }
    throw new ApiError(res.status, message)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// Authenticated file download (e.g. CSV export — Req 36). Mirrors request()'s bearer
// header + single 401-refresh, but returns the raw body as a Blob and triggers a
// browser download instead of parsing JSON.
async function download(path: string, filename: string, isRetry = false): Promise<void> {
  const { accessToken } = authSnapshot()
  const headers: Record<string, string> = {}
  if (accessToken) headers['authorization'] = `Bearer ${accessToken}`

  const res = await fetch(`${API_BASE}${path}`, { method: 'GET', headers })

  if (res.status === 401 && !isRetry) {
    const next = await refreshAccessToken()
    if (next) return download(path, filename, true)
    redirectToLogin()
    throw new ApiError(401, 'Unauthorized')
  }
  if (!res.ok) throw new ApiError(res.status, res.statusText)

  const blob = await res.blob()
  if (typeof window !== 'undefined') {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }
}

// Authenticated inline media fetch (Req 3 — patient image). Like download(), but
// returns an object URL for rendering in an <img> (the browser can't set the bearer
// header on an <img src>). The caller revokes the URL when the element unmounts.
async function blobUrl(path: string, isRetry = false): Promise<string> {
  const { accessToken } = authSnapshot()
  const headers: Record<string, string> = {}
  if (accessToken) headers['authorization'] = `Bearer ${accessToken}`

  const res = await fetch(`${API_BASE}${path}`, { method: 'GET', headers })

  if (res.status === 401 && !isRetry) {
    const next = await refreshAccessToken()
    if (next) return blobUrl(path, true)
    redirectToLogin()
    throw new ApiError(401, 'Unauthorized')
  }
  if (!res.ok) throw new ApiError(res.status, res.statusText)

  return URL.createObjectURL(await res.blob())
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  blobUrl,
  post: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  download,
}

export { API_BASE }
