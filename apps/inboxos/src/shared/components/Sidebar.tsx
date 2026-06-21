'use client'

// Shared left navigation rail used by both the clinic and admin shells. Renders a
// brand header, the supplied nav links (active-aware), a language toggle and the
// user identity + logout.
import Link from 'next/link'
import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '../store/auth'
import { useI18n } from '../hooks/useI18n'
import { useLogout } from '../hooks/useLogout'
import { LanguageToggle } from './LanguageToggle'

export interface NavLink {
  href: string
  label: string
  icon?: ReactNode
}

// An optional labelled section. A group with no label renders its items under a
// thin divider (used to pin "Back to inbox" at the bottom).
export interface NavGroup {
  label?: string
  items: NavLink[]
}

export function Sidebar({ links, groups, title }: { links?: NavLink[]; groups?: NavGroup[]; title: string }) {
  const pathname = usePathname()
  const { t } = useI18n()
  const logout = useLogout()
  const user = useAuthStore((s) => s.user)

  const renderLink = (link: NavLink) => {
    const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
    return (
      <Link
        key={link.href}
        href={link.href}
        className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
          active
            ? 'bg-indigo-600 font-medium text-white'
            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
        }`}
      >
        {link.icon ? <span className="shrink-0 opacity-90">{link.icon}</span> : null}
        <span className="truncate">{link.label}</span>
      </Link>
    )
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <p className="text-sm font-bold">{t('app.name')}</p>
        <p className="text-xs text-gray-400">{title}</p>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {groups
          ? groups.map((group, i) => (
              <div
                key={group.label ?? `group-${i}`}
                className={group.label ? '' : 'mt-1 border-t border-gray-200 pt-2 dark:border-gray-800'}
              >
                {group.label ? (
                  <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {group.label}
                  </p>
                ) : null}
                <div className="space-y-0.5">{group.items.map(renderLink)}</div>
              </div>
            ))
          : (links ?? []).map(renderLink)}
      </nav>

      <div className="space-y-2 border-t border-gray-200 p-3 dark:border-gray-800">
        <LanguageToggle />
        {user && (
          <div className="space-y-1">
            <p className="truncate text-xs text-gray-400">{user.email}</p>
            {/* Req 2: surface the active role so it is clear from the UI which
                role-specific view the user is in. */}
            <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {t(`studio.users.role.${user.role}` as Parameters<typeof t>[0])}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => void logout()}
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {t('nav.logout')}
        </button>
      </div>
    </aside>
  )
}
