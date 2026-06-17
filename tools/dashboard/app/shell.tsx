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
  'Build Control': 'Control',
  'Six Gates': 'Controles',
  'Phase Progress': 'Fases',
  'API Cost': 'Costo',
  Diagnostics: 'Diagnostico',
  Ready: 'Listo',
  Agents: 'Agentes',
  Logs: 'Registros',
  'Webhook Console': 'Webhooks',
  'Seed Generator': 'Datos',
  'Discord Status': 'Discord',
  Deploy: 'Despliegue',
  Settings: 'Configuracion'
}

const navIcons: Record<string, string> = {
  Backlog: 'B',
  'Build Control': '▶',
  'Six Gates': 'G',
  'Phase Progress': 'P',
  'API Cost': '$',
  Diagnostics: 'D',
  Ready: '!',
  Agents: 'A',
  Logs: 'L',
  'Webhook Console': 'W',
  'Seed Generator': 'S',
  'Discord Status': 'C',
  Deploy: 'R',
  Settings: 'T'
}

const primaryMobile = ['Ready', 'Build Control', 'Phase Progress', 'Six Gates', 'Deploy']

export function DashboardShell({ children, nav }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [language, setLanguage] = useState<'en' | 'es'>('en')
  const [moreOpen, setMoreOpen] = useState(false)
  const [readyCritical, setReadyCritical] = useState(0)

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

  useEffect(() => {
    fetch('/api/ready/status')
      .then((response) => response.json())
      .then((data: { critical?: number }) => setReadyCritical(data.critical ?? 0))
      .catch(() => setReadyCritical(0))
  }, [])

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

  function labelFor(label: string) {
    return language === 'es' ? spanishLabels[label] ?? label : label
  }

  const primaryLinks = nav.filter(([label]) => primaryMobile.includes(label))
  const moreLinks = nav.filter(([label]) => !primaryMobile.includes(label))

  return (
    <div className={`theme-${theme} flex min-h-screen bg-slate-950 text-slate-100`}>
      <aside className={`${collapsed ? 'lg:w-16' : 'lg:w-64'} hidden w-16 border-r border-slate-800 bg-slate-900 p-3 transition-[width] duration-200 md:block`}>
        <div className="mb-6 flex items-center justify-between gap-2">
          {!collapsed && <Link href="/" className="hidden text-xl font-semibold lg:block">Docmee DevTools</Link>}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Show side menu' : 'Hide side menu'}
            title={collapsed ? 'Show side menu' : 'Hide side menu'}
            className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md border border-slate-700 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <span className="hidden lg:inline">{collapsed ? '>' : '<'}</span>
            <span className="lg:hidden">D</span>
          </button>
        </div>
        <nav className="space-y-1">
          {nav.map(([label, href]) => {
            const displayLabel = labelFor(label)
            const compact = collapsed
            return (
              <Link
                key={href}
                href={href}
                title={displayLabel}
                className={`grid min-h-11 place-items-center rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white lg:block ${compact ? 'lg:text-center' : ''}`}
              >
                <span className="lg:hidden">{navIcons[label] ?? displayLabel.slice(0, 1)}</span>
                <span className="hidden lg:inline">{compact ? navIcons[label] ?? displayLabel.slice(0, 1) : displayLabel}</span>
              </Link>
            )
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        <header className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950 px-4 py-2 md:justify-end md:px-8 md:py-3">
          <Link href="/" className="text-base font-semibold md:hidden">Docmee DevTools</Link>
          <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="min-h-11 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Toggle light and dark mode"
          >
            {language === 'es' ? theme === 'dark' ? 'Modo claro' : 'Modo oscuro' : theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            type="button"
            onClick={toggleLanguage}
            className="min-h-11 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Toggle English and Spanish"
          >
            {language === 'en' ? 'Español' : 'English'}
          </button>
          </div>
        </header>
        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-900 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 md:hidden">
        <div className="grid grid-cols-6 gap-1">
          {primaryLinks.map(([label, href]) => (
            <Link key={href} href={href} className="grid min-h-11 place-items-center rounded-md px-1 py-1 text-center text-[11px] text-slate-300 hover:bg-slate-800">
              <span className="text-sm">{navIcons[label] ?? label.slice(0, 1)}</span>
              <span className="truncate">{labelFor(label)}</span>
            </Link>
          ))}
          <button type="button" onClick={() => setMoreOpen(true)} className="relative grid min-h-11 place-items-center rounded-md px-1 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
            {readyCritical > 0 && <span className="absolute right-3 top-1 h-2 w-2 rounded-full bg-red-500" />}
            <span className="text-sm">...</span>
            <span>{language === 'es' ? 'Mas' : 'More'}</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] rounded-t-xl border border-slate-800 bg-slate-900 p-4 pb-[max(env(safe-area-inset-bottom),1rem)]" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-12 rounded bg-slate-700" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{language === 'es' ? 'Mas opciones' : 'More options'}</h2>
              <button type="button" onClick={() => setMoreOpen(false)} className="min-h-11 rounded-md border border-slate-700 px-3 py-2 text-sm">Close</button>
            </div>
            <div className="grid gap-2">
              {moreLinks.map(([label, href]) => (
                <Link key={href} href={href} onClick={() => setMoreOpen(false)} className="flex min-h-11 items-center gap-3 rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-300">
                  <span className="grid h-8 w-8 place-items-center rounded bg-slate-800">{navIcons[label] ?? label.slice(0, 1)}</span>
                  {labelFor(label)}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
