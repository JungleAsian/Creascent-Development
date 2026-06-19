'use client'

// Shared left navigation rail used by both the clinic and admin shells. Renders a
// brand header, the supplied nav links (active-aware), a language toggle and the
// user identity + logout.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '../store/auth'
import { useI18n } from '../hooks/useI18n'
import { useLogout } from '../hooks/useLogout'
import { LanguageToggle } from './LanguageToggle'

export interface NavLink {
  href: string
  label: string
}

export function Sidebar({ links, title }: { links: NavLink[]; title: string }) {
  const pathname = usePathname()
  const { t } = useI18n()
  const logout = useLogout()
  const user = useAuthStore((s) => s.user)

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <p className="text-sm font-bold">{t('app.name')}</p>
        <p className="text-xs text-gray-400">{title}</p>
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`block rounded-md px-3 py-2 text-sm ${
                active
                  ? 'bg-indigo-600 font-medium text-white'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              {link.label}
            </Link>
          )
        })}
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
