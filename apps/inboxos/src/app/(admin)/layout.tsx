'use client'

// IA Studio shell — admin only (ia_studio_admin). Guards the role and frames the
// admin pages with a persistent sidebar (desktop) / slide-in drawer (mobile),
// a top bar with breadcrumbs, and a hamburger toggle.
import { useMemo, useState } from 'react'
import { useAuthGuard } from '@/shared/hooks/useAuthGuard'
import { useHeartbeat } from '@/shared/hooks/useHeartbeat'
import { useI18n } from '@/shared/hooks/useI18n'
import { Sidebar, type NavLink } from '@/shared/components/Sidebar'
import { Breadcrumbs } from '@/shared/components/Breadcrumbs'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { ready } = useAuthGuard(['ia_studio_admin'])
  const { t } = useI18n()
  const [drawerOpen, setDrawerOpen] = useState(false)
  useHeartbeat()

  const links = useMemo<NavLink[]>(
    () => [
      { href: '/studio/clinics', label: t('nav.clinics') },
      { href: '/studio/kb', label: t('nav.kb') },
      { href: '/studio/quick-replies', label: t('nav.quickReplies') },
      { href: '/studio/templates', label: t('nav.templates') },
      { href: '/studio/errors', label: t('nav.errors') },
      { href: '/studio/usage', label: t('nav.usage') },
      { href: '/studio/license', label: t('nav.license') },
      { href: '/studio/compliance', label: t('nav.compliance') },
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
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar links={links} title={t('studio.title')} />
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
            <Sidebar links={links} title={t('studio.title')} />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-gray-200 px-4 py-2.5 dark:border-gray-800">
          <button
            type="button"
            aria-label={t('common.openMenu')}
            onClick={() => setDrawerOpen(true)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm md:hidden dark:border-gray-700"
          >
            ☰
          </button>
          <Breadcrumbs />
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
