'use client'

// IA Studio shell — admin only (ia_studio_admin). Guards the role and frames the
// admin pages with a persistent sidebar (desktop) / slide-in drawer (mobile),
// a top bar with breadcrumbs, and a hamburger toggle.
import { useMemo, useState } from 'react'
import { useAuthGuard } from '@/shared/hooks/useAuthGuard'
import { useHeartbeat } from '@/shared/hooks/useHeartbeat'
import { useI18n } from '@/shared/hooks/useI18n'
import { Sidebar, type NavGroup } from '@/shared/components/Sidebar'
import { NavIcon } from '@/shared/components/NavIcon'
import { Breadcrumbs } from '@/shared/components/Breadcrumbs'
import { PushOptIn } from '@/shared/components/PushOptIn'
import { InstallPrompt } from '@/shared/components/InstallPrompt'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { ready } = useAuthGuard(['ia_studio_admin'])
  const { t } = useI18n()
  const [drawerOpen, setDrawerOpen] = useState(false)
  useHeartbeat()

  // Grouped IA Studio rail — labelled sections + a glyph per item so all admin
  // features stay scannable. "Back to inbox" is pinned below a divider.
  const groups = useMemo<NavGroup[]>(
    () => [
      {
        label: t('nav.group.clinics'),
        items: [
          { href: '/studio/clinics', label: t('nav.clinics'), icon: <NavIcon name="clinics" /> },
          { href: '/studio/users', label: t('nav.users'), icon: <NavIcon name="users" /> },
          { href: '/studio/doctors', label: t('nav.doctors'), icon: <NavIcon name="doctors" /> },
        ],
      },
      {
        label: t('nav.group.messaging'),
        items: [
          { href: '/studio/channels', label: t('nav.channels'), icon: <NavIcon name="channels" /> },
          { href: '/studio/quick-replies', label: t('nav.quickReplies'), icon: <NavIcon name="quickReplies" /> },
          { href: '/studio/templates', label: t('nav.templates'), icon: <NavIcon name="templates" /> },
          { href: '/studio/automations', label: t('nav.automations'), icon: <NavIcon name="automations" /> },
          { href: '/studio/kb', label: t('nav.kb'), icon: <NavIcon name="kb" /> },
          { href: '/studio/custom-flows', label: t('nav.customFlows'), icon: <NavIcon name="customFlows" /> },
        ],
      },
      {
        label: t('nav.group.operations'),
        items: [
          { href: '/studio/errors', label: t('nav.errors'), icon: <NavIcon name="errors" /> },
          { href: '/studio/usage', label: t('nav.usage'), icon: <NavIcon name="usage" /> },
          { href: '/studio/license', label: t('nav.license'), icon: <NavIcon name="license" /> },
        ],
      },
      {
        label: t('nav.group.compliance'),
        items: [
          { href: '/studio/compliance', label: t('nav.compliance'), icon: <NavIcon name="compliance" /> },
        ],
      },
      {
        items: [{ href: '/inbox', label: t('nav.backToInbox'), icon: <NavIcon name="inbox" /> }],
      },
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
        <Sidebar groups={groups} title={t('studio.title')} />
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
            <Sidebar groups={groups} title={t('studio.title')} />
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
          {/* Req 39: let an admin enable Web Push on this device too, so platform
              alerts reach them on their phone with the panel closed. */}
          <div className="ml-auto">
            <PushOptIn />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* Req 23 — PWA install sheet (Add to Home Screen). */}
      <InstallPrompt />
    </div>
  )
}
