'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { SpanishTranslator } from './spanish-translator'

type DashboardShellProps = {
  children: ReactNode
  nav: string[][]
}
type HeartbeatState = {
  live?: boolean
  run?: { phase?: string; heartbeatAt?: string; heartbeatAgeMs?: number; message?: string }
  heartbeat?: { status?: string }
}

const spanishLabels: Record<string, string> = {
  Backlog: 'Pendientes',
  'Build Control': 'Control',
  'Six Gates': 'Controles',
  'Phase Progress': 'Fases',
  'Development Cost': 'Costo',
  'Stack Intelligence': 'Stack',
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

const navIcons: Record<string, ReactNode> = {
  Backlog: '/lineicons/clipboard.svg',
  Ready: '/lineicons/check-circle-1.svg',
  'Build Control': '/lineicons/dashboard-square-1.svg',
  'Install Monitor': '/lineicons/heart.svg',
  'Claude Switch': '/lineicons/claude.svg',
  'Six Gates': '/lineicons/shield-2-check.svg',
  'Phase Progress': '/lineicons/bar-chart-4.svg',
  'Development Cost': '/lineicons/dollar-circle.svg',
  'Stack Intelligence': '/lineicons/layers-1.svg',
  Diagnostics: '/lineicons/bug-1.svg',
  Agents: '/lineicons/gears-3.svg',
  Logs: '/lineicons/file-multiple.svg',
  'Webhook Console': '/lineicons/webhooks.svg',
  'Seed Generator': '/lineicons/database-2.svg',
  'Discord Status': '/lineicons/discord-chat.svg',
  Deploy: '/lineicons/cloud-upload.svg',
  Settings: '/lineicons/gear-1.svg'
}

const primaryMobile = ['Ready', 'Build Control', 'Phase Progress', 'Six Gates', 'Deploy']

export function DashboardShell({ children, nav }: DashboardShellProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [language, setLanguage] = useState<'en' | 'es'>('en')
  const [moreOpen, setMoreOpen] = useState(false)
  const [readyCritical, setReadyCritical] = useState(0)
  const [heartbeat, setHeartbeat] = useState<HeartbeatState | null>(null)

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

  useEffect(() => {
    let mounted = true
    function refreshHeartbeat() {
      fetch('/api/install-monitor/status', { cache: 'no-store' })
        .then((response) => response.json())
        .then((data: HeartbeatState) => {
          if (mounted) setHeartbeat(data)
        })
        .catch(() => {
          if (mounted) setHeartbeat({ live: false, heartbeat: { status: 'unknown' } })
        })
    }
    refreshHeartbeat()
    const timer = window.setInterval(refreshHeartbeat, 5000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
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

  function navIconFor(label: string, active = false) {
    const icon = navIcons[label]
    return (
      <span className={`grid h-10 w-10 place-items-center rounded-md border ${active ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-100' : 'border-slate-700/70 bg-slate-900/70 text-slate-300'}`}>
        {typeof icon === 'string' ? (
          <span
            aria-hidden="true"
            className="h-5 w-5 bg-current"
            style={{
              WebkitMask: `url(${icon}) center / contain no-repeat`,
              mask: `url(${icon}) center / contain no-repeat`
            }}
          />
        ) : (
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {icon ?? <path d="M12 5v14M5 12h14" />}
          </svg>
        )}
      </span>
    )
  }

  function heartbeatTone(status?: string) {
    if (status === 'normal') return 'text-emerald-300 border-emerald-700/70 bg-emerald-950/30'
    if (status === 'paused' || status === 'delayed' || status === 'sentinel') return 'text-amber-300 border-amber-700/70 bg-amber-950/30'
    if (status === 'lost' || status === 'dead') return 'text-red-300 border-red-700/70 bg-red-950/30'
    return 'text-slate-300 border-slate-700 bg-slate-900/70'
  }

  function heartbeatLabel(status?: string) {
    if (status === 'normal') return language === 'es' ? 'Vivo' : 'Live'
    if (status === 'paused') return language === 'es' ? 'Pausado' : 'Paused'
    if (status === 'sentinel') return language === 'es' ? 'Revisando' : 'Checking'
    if (status === 'delayed') return language === 'es' ? 'Lento' : 'Delayed'
    if (status === 'lost') return language === 'es' ? 'Perdido' : 'Lost'
    if (status === 'dead') return language === 'es' ? 'Muerto' : 'Dead'
    if (status === 'stopped') return language === 'es' ? 'Detenido' : 'Stopped'
    return language === 'es' ? 'Desconocido' : 'Unknown'
  }

  const primaryLinks = nav.filter(([label]) => primaryMobile.includes(label))
  const moreLinks = nav.filter(([label]) => !primaryMobile.includes(label))
  const currentLabel = nav.find(([, href]) => pathname === href || (href !== '/' && pathname.startsWith(href)))?.[0] ?? 'Overview'
  const readyText = readyCritical > 0 ? `${readyCritical} blockers` : 'Ready'

  return (
    <div className={`theme-${theme} app-shell flex min-h-screen text-slate-100`}>
      <aside className={`${collapsed ? 'lg:w-20' : 'lg:w-24'} app-sidebar hidden w-20 border-r p-3 transition-[width] duration-200 md:block`}>
        <div className="mb-5 flex flex-col items-center gap-2">
          <Link href="/" className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-cyan-400/40 bg-cyan-400/10 text-cyan-100" title="Docmee DevTools" aria-label="Docmee DevTools home">
            <span className="text-sm font-semibold">D</span>
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Show side menu' : 'Hide side menu'}
            title={collapsed ? 'Show side menu' : 'Hide side menu'}
            className="ui-action grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md border text-sm text-slate-300 hover:text-white"
          >
            <span className="hidden lg:inline">{collapsed ? '>' : '<'}</span>
            <span className="lg:hidden">D</span>
          </button>
        </div>
        <nav className="space-y-2">
          {nav.map(([label, href]) => {
            const displayLabel = labelFor(label)
            const active = pathname === href || (href !== '/' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                title={displayLabel}
                aria-label={displayLabel}
                className={`grid min-h-12 place-items-center rounded-md text-sm hover:text-white ${active ? 'bg-cyan-500/10 text-cyan-100 ring-1 ring-cyan-400/30' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                {navIconFor(label, active)}
              </Link>
            )
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        <header className="app-header sticky top-0 z-30 flex min-h-14 flex-wrap items-center justify-between gap-2 border-b px-4 py-2 md:px-8 md:py-3">
          <div className="min-w-0">
            <Link href="/" className="text-base font-semibold md:hidden">Docmee DevTools</Link>
            <div className="hidden md:block">
              <div className="text-xs text-slate-500">Current workspace</div>
              <div className="text-sm font-medium text-slate-200">{labelFor(currentLabel)}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href="/install-monitor"
            className={`heartbeat-pill flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm ${heartbeatTone(heartbeat?.heartbeat?.status)}`}
            title={heartbeat?.run?.message ?? 'Build heartbeat status'}
          >
            <span className={`heartbeat-heart ${heartbeat?.heartbeat?.status === 'normal' ? 'heartbeat-heart-live' : ''}`} aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M12 21s-7.2-4.6-9.5-9.1C.6 8.1 2.8 4 6.8 4c2 0 3.7 1 5.2 2.9C13.5 5 15.2 4 17.2 4c4 0 6.2 4.1 4.3 7.9C19.2 16.4 12 21 12 21Z" />
              </svg>
            </span>
            <span className="hidden sm:inline">{heartbeatLabel(heartbeat?.heartbeat?.status)}</span>
            {heartbeat?.run?.phase && <span className="hidden rounded bg-slate-950/40 px-1.5 py-0.5 text-xs md:inline">{heartbeat.run.phase}</span>}
          </Link>
          <Link href="/ready" className={readyCritical > 0 ? 'min-h-11 rounded-md border border-red-700/70 px-3 py-2 text-sm text-red-200 hover:bg-red-950/50' : 'min-h-11 rounded-md border border-emerald-700/70 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-950/40'}>
            {readyText}
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            className={`ui-action grid min-h-11 min-w-11 place-items-center rounded-md border px-3 py-2 text-sm hover:text-white ${theme === 'light' ? 'text-amber-300' : 'text-slate-300'}`}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <svg
              aria-hidden="true"
              className={`h-5 w-5 transition-all ${theme === 'light' ? 'drop-shadow-[0_0_8px_rgba(251,191,36,0.65)]' : ''}`}
              viewBox="0 0 24 24"
              fill={theme === 'light' ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 2a7 7 0 0 0-4 12.7c.7.5 1 1.1 1 1.8V17h6v-.5c0-.7.3-1.3 1-1.8A7 7 0 0 0 12 2Z" />
              {theme === 'light' && <path d="M12 5v2M4 12h2M18 12h2M6.6 6.6 8 8M16 8l1.4-1.4" fill="none" />}
            </svg>
          </button>
          <button
            type="button"
            onClick={toggleLanguage}
            className="ui-action min-h-11 rounded-md border px-3 py-2 text-sm text-slate-300 hover:text-white"
            aria-label="Toggle English and Spanish"
          >
            {language === 'en' ? 'Español' : 'English'}
          </button>
          </div>
        </header>
        <div className="dashboard-content p-3 md:p-4 lg:p-5">
          <SpanishTranslator language={language}>{children}</SpanishTranslator>
        </div>
      </main>

      <nav className="app-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 md:hidden">
        <div className="grid grid-cols-6 gap-1">
          {primaryLinks.map(([label, href]) => (
            <Link key={href} href={href} className={`grid min-h-11 place-items-center rounded-md px-1 py-1 text-center text-[11px] ${pathname === href || pathname.startsWith(href) ? 'bg-cyan-500/10 text-cyan-100' : 'text-slate-300 hover:bg-slate-800'}`}>
              <span className="scale-75">{navIconFor(label, pathname === href || pathname.startsWith(href))}</span>
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
          <div className="app-more-sheet absolute inset-x-0 bottom-0 max-h-[85vh] rounded-t-xl border p-4 pb-[max(env(safe-area-inset-bottom),1rem)]" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-12 rounded bg-slate-700" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{language === 'es' ? 'Mas opciones' : 'More options'}</h2>
              <button type="button" onClick={() => setMoreOpen(false)} className="ui-action min-h-11 rounded-md border px-3 py-2 text-sm">Close</button>
            </div>
            <div className="grid gap-2">
              {moreLinks.map(([label, href]) => (
                <Link key={href} href={href} onClick={() => setMoreOpen(false)} className="flex min-h-11 items-center gap-3 rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-300">
                  {navIconFor(label, pathname === href || pathname.startsWith(href))}
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

