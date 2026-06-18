'use client'

// IA Studio shell — admin only (ia_studio_admin). Guards the role and frames the
// admin pages (clinics, KB, error review, usage) with the shared sidebar.
import { useMemo } from 'react'
import { useAuthGuard } from '@/shared/hooks/useAuthGuard'
import { useHeartbeat } from '@/shared/hooks/useHeartbeat'
import { useI18n } from '@/shared/hooks/useI18n'
import { Sidebar, type NavLink } from '@/shared/components/Sidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { ready } = useAuthGuard(['ia_studio_admin'])
  const { t } = useI18n()
  useHeartbeat()

  const links = useMemo<NavLink[]>(
    () => [
      { href: '/studio/clinics', label: t('nav.clinics') },
      { href: '/studio/kb', label: t('nav.kb') },
      { href: '/studio/errors', label: t('nav.errors') },
      { href: '/studio/usage', label: t('nav.usage') },
      { href: '/inbox', label: t('nav.backToInbox') },
    ],
    [t],
  )

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar links={links} title={t('studio.title')} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
