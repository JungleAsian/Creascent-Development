'use client'

// Clinic shell (secretary, doctor, clinic_admin — and admins passing through).
// Guards authentication, runs the presence heartbeat, and frames the page with
// the shared sidebar.
import { useMemo, useState } from 'react'
import { useAuthGuard } from '@/shared/hooks/useAuthGuard'
import { useHeartbeat } from '@/shared/hooks/useHeartbeat'
import { useFeatures } from '@/shared/hooks/useFeatures'
import { useI18n } from '@/shared/hooks/useI18n'
import { Sidebar, type NavLink } from '@/shared/components/Sidebar'
import { NotificationBell } from '@/shared/components/NotificationBell'

export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  const { ready, user } = useAuthGuard()
  const { t } = useI18n()
  const { features } = useFeatures()
  const [drawerOpen, setDrawerOpen] = useState(false)
  useHeartbeat()

  const links = useMemo<NavLink[]>(() => {
    const base: NavLink[] = [{ href: '/inbox', label: t('nav.inbox') }]
    if (user?.role === 'clinic_admin' || user?.role === 'ia_studio_admin') {
      base.push({ href: '/metrics', label: t('nav.metrics') })
      // Req 40: the advanced analytics dashboard is gated behind a server feature flag.
      if (features.advancedAnalytics) base.push({ href: '/analytics', label: t('nav.analytics') })
      base.push({ href: '/qos', label: t('nav.qos') })
      base.push({ href: '/reports', label: t('nav.reports') })
    }
    if (user?.role === 'ia_studio_admin') base.push({ href: '/studio', label: t('nav.studio') })
    return base
  }, [t, user?.role, features.advancedAnalytics])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar links={links} title={t('nav.inbox')} />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            type="button"
            aria-label={t('common.closeMenu')}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative z-10" onClick={() => setDrawerOpen(false)}>
            <Sidebar links={links} title={t('nav.inbox')} />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-4 py-2 dark:border-gray-800">
          <button
            type="button"
            aria-label={t('common.openMenu')}
            onClick={() => setDrawerOpen(true)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm md:hidden dark:border-gray-700"
          >
            ☰
          </button>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
