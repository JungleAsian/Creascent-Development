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
  /** Hydration guard — false until persisted state has loaded on the client. */
  hydrated: boolean
  setSession: (data: {
    accessToken: string
    refreshToken: string
    user: AuthUser
    language?: PanelLanguage
  }) => void
  setAccessToken: (token: string) => void
  setLanguage: (language: PanelLanguage) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      language: DEFAULT_LANGUAGE,
      hydrated: false,
      setSession: ({ accessToken, refreshToken, user, language }) =>
        set((s) => ({ accessToken, refreshToken, user, language: language ?? s.language })),
      setAccessToken: (accessToken) => set({ accessToken }),
      setLanguage: (language) => set({ language }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
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
