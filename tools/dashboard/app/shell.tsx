'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

type DashboardShellProps = {
  children: ReactNode
  nav: string[][]
}

const spanishLabels: Record<string, string> = {
  Backlog: 'Pendientes',
  'Six Gates': 'Controles',
  'Phase Progress': 'Fases',
  'API Cost': 'Costo',
  Diagnostics: 'Diagnostico',
  Agents: 'Agentes',
  Logs: 'Registros',
  'Webhook Console': 'Webhooks',
  'Seed Generator': 'Datos',
  'Discord Status': 'Discord',
  Deploy: 'Despliegue',
  Settings: 'Configuracion'
}

export function DashboardShell({ children, nav }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [language, setLanguage] = useState<'en' | 'es'>('en')

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('docmee-sidebar-collapsed') === 'true')
    const savedTheme = window.localStorage.getItem('docmee-theme')
    const savedLanguage = window.localStorage.getItem('docmee-language')
    if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme)
    if (savedLanguage === 'en' || savedLanguage === 'es') setLanguage(savedLanguage)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = language
  }, [theme, language])

  function toggleSidebar() {
    const next = !collapsed
    setCollapsed(next)
    window.localStorage.setItem('docmee-sidebar-collapsed', String(next))
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    window.localStorage.setItem('docmee-theme', next)
  }

  function toggleLanguage() {
    const next = language === 'en' ? 'es' : 'en'
    setLanguage(next)
    window.localStorage.setItem('docmee-language', next)
  }

  return (
    <div className={`theme-${theme} flex min-h-screen bg-slate-950 text-slate-100`}>
      <aside className={`${collapsed ? 'w-16' : 'w-64'} border-r border-slate-800 bg-slate-900 p-3 transition-[width] duration-200`}>
        <div className="mb-6 flex items-center justify-between gap-2">
          {!collapsed && <Link href="/" className="block text-xl font-semibold">Docmee DevTools</Link>}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Show side menu' : 'Hide side menu'}
            title={collapsed ? 'Show side menu' : 'Hide side menu'}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-700 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {collapsed ? '>' : '<'}
          </button>
        </div>
        <nav className="space-y-1">
          {nav.map(([label, href]) => {
            const displayLabel = language === 'es' ? spanishLabels[label] ?? label : label
            return (
              <Link
                key={href}
                href={href}
                title={displayLabel}
                className={`block rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white ${collapsed ? 'text-center' : ''}`}
              >
                {collapsed ? displayLabel.slice(0, 1) : displayLabel}
              </Link>
            )
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <header className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-800 bg-slate-950 px-8 py-3">
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Toggle light and dark mode"
          >
            {language === 'es' ? theme === 'dark' ? 'Modo claro' : 'Modo oscuro' : theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            type="button"
            onClick={toggleLanguage}
            className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Toggle English and Spanish"
          >
            {language === 'en' ? 'Español' : 'English'}
          </button>
        </header>
        <div className="p-8">{children}</div>
      </main>
    </div>
  )
}
