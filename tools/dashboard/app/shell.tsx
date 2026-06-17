'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

type DashboardShellProps = {
  children: ReactNode
  nav: string[][]
}

export function DashboardShell({ children, nav }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('docmee-sidebar-collapsed') === 'true')
  }, [])

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    window.localStorage.setItem('docmee-sidebar-collapsed', String(next))
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className={`${collapsed ? 'w-16' : 'w-64'} border-r border-slate-800 bg-slate-900 p-3 transition-[width] duration-200`}>
        <div className="mb-6 flex items-center justify-between gap-2">
          {!collapsed && <Link href="/" className="block text-xl font-semibold">Docmee DevTools</Link>}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Show side menu' : 'Hide side menu'}
            title={collapsed ? 'Show side menu' : 'Hide side menu'}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-700 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {collapsed ? '>' : '<'}
          </button>
        </div>
        <nav className="space-y-1">
          {nav.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              title={label}
              className={`block rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white ${collapsed ? 'text-center' : ''}`}
            >
              {collapsed ? label.slice(0, 1) : label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  )
}
