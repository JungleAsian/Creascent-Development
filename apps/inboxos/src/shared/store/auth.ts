// Auth store (Zustand, persisted to localStorage). Holds the access + refresh
// tokens, the logged-in user, and the panel language. The api client reads tokens
// from here; the heartbeat + language toggle read/write the language.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser, PanelLanguage } from '../types'
import { DEFAULT_LANGUAGE } from '../i18n'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: AuthUser | null
  language: PanelLanguage
  /**
   * Screen 6 — the clinic the operator is currently working in. Defaults to the
   * user's own clinic on login; an ia_studio_admin may switch it to operate any
   * clinic's inbox/calendar. The api client sends it as the X-Clinic-Id header so
   * the server scopes every clinic request to it (non-admins are pinned server-side
   * to their own clinic, so the header is only an escalation path for admins).
   */
  activeClinicId: string | null
  /** Hydration guard — false until persisted state has loaded on the client. */
  hydrated: boolean
  setSession: (data: {
    accessToken: string
    refreshToken: string
    user: AuthUser
    language?: PanelLanguage
  }) => void
  setAccessToken: (token: string) => void
  setRefreshToken: (token: string) => void
  setLanguage: (language: PanelLanguage) => void
  setActiveClinicId: (clinicId: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      language: DEFAULT_LANGUAGE,
      activeClinicId: null,
      hydrated: false,
      setSession: ({ accessToken, refreshToken, user, language }) =>
        // A fresh login always resets the active clinic to the user's own clinic —
        // an admin's previous switch must not carry over to the next session.
        set((s) => ({ accessToken, refreshToken, user, language: language ?? s.language, activeClinicId: user.clinicId })),
      setAccessToken: (accessToken) => set({ accessToken }),
      setRefreshToken: (refreshToken) => set({ refreshToken }),
      setLanguage: (language) => set({ language }),
      setActiveClinicId: (activeClinicId) => set({ activeClinicId }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null, activeClinicId: null }),
    }),
    {
      name: 'docmee-auth',
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true
      },
    },
  ),
)

/** Non-reactive snapshot for use outside React (e.g. the api client). */
export const authSnapshot = () => useAuthStore.getState()
