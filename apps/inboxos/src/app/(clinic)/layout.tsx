'use client'

// Clinic shell (secretary, doctor, clinic_admin — and admins passing through).
// Guards authentication, runs the presence heartbeat, and frames the page with
// the shared sidebar.
import { useMemo } from 'react'
import { useAuthGuard } from '@/shared/hooks/useAuthGuard'
import { useHeartbeat } from '@/shared/hooks/useHeartbeat'
import { useI18n } from '@/shared/hooks/useI18n'
import { Sidebar, type NavLink } from '@/shared/components/Sidebar'

export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  const { ready, user } = useAuthGuard()
  const { t } = useI18n()
  useHeartbeat()

  const links = useMemo<NavLink[]>(() => {
    const base: NavLink[] = [{ href: '/inbox', label: t('nav.inbox') }]
    if (user?.role === 'ia_studio_admin') base.push({ href: '/studio', label: t('nav.studio') })
    return base
  }, [t, user?.role])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar links={links} title={t('nav.inbox')} />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
