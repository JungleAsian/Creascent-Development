'use client'

// Clinic shell (secretary, doctor, clinic_admin — and admins passing through).
// Guards authentication, runs the presence heartbeat, and frames the page with
// the shared sidebar.
import { useMemo, useState } from 'react'
import { useAuthGuard } from '@/shared/hooks/useAuthGuard'
import { useHeartbeat } from '@/shared/hooks/useHeartbeat'
import { useFeatures } from '@/shared/hooks/useFeatures'
import { useI18n } from '@/shared/hooks/useI18n'
import { can } from '@/shared/permissions'
import { Sidebar, type NavLink } from '@/shared/components/Sidebar'
import { NotificationBell } from '@/shared/components/NotificationBell'
import { PushOptIn } from '@/shared/components/PushOptIn'
import { ClinicSwitcher } from '@/shared/components/ClinicSwitcher'

export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  const { ready, user } = useAuthGuard()
  const { t } = useI18n()
  const { features } = useFeatures()
  const [drawerOpen, setDrawerOpen] = useState(false)
  useHeartbeat()

  // Req 2: nav links derive from the shared RBAC matrix (mirrors the API's
  // requireRole gating) so a role only ever sees surfaces it can actually use.
  const links = useMemo<NavLink[]>(() => {
    const role = user?.role
    const base: NavLink[] = []
    if (can(role, 'inbox')) base.push({ href: '/inbox', label: t('nav.inbox') })
    // Alerts center (Screen 11) — available to everyone who can see the inbox.
    if (can(role, 'inbox')) base.push({ href: '/alerts', label: t('nav.alerts') })
    if (can(role, 'calendar')) base.push({ href: '/calendar', label: t('nav.calendar') })
    if (can(role, 'metrics')) base.push({ href: '/metrics', label: t('nav.metrics') })
    // Req 40: the advanced analytics dashboard is additionally gated behind a
    // server feature flag (capability is necessary but not sufficient).
    if (can(role, 'analytics') && features.advancedAnalytics) {
      base.push({ href: '/analytics', label: t('nav.analytics') })
    }
    if (can(role, 'qos')) base.push({ href: '/qos', label: t('nav.qos') })
    if (can(role, 'reports')) base.push({ href: '/reports', label: t('nav.reports') })
    if (can(role, 'studio')) base.push({ href: '/studio', label: t('nav.studio') })
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
          {/* Screen 6 — tenant separation: always show (and, for admins, switch) the
              clinic being operated on so the active tenant is unmistakable. */}
          <ClinicSwitcher />
          <div className="ml-auto flex items-center gap-2">
            <PushOptIn />
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
