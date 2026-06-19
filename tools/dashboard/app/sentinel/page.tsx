import Link from 'next/link'
import {
  readIssues,
  activeIssues,
  summarize,
  readHeartbeat,
  heartbeatLiveness,
  readTray,
  readTunnel,
  readProvider,
  livenessClass,
  type PlatformIssue
} from '../lib/sentinel-platform'
import { IssueList } from '../sentinel-shared'

export const dynamic = 'force-dynamic'

type Filter = 'all' | 'production' | 'build' | 'approval' | 'devtools'
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'production', label: 'Production' },
  { id: 'build', label: 'Build' },
  { id: 'approval', label: 'Approval' },
  { id: 'devtools', label: 'DevTools' }
]

function applyFilter(issues: PlatformIssue[], filter: Filter): PlatformIssue[] {
  if (filter === 'production') return issues.filter((i) => i.environment === 'production')
  if (filter === 'build') return issues.filter((i) => i.source === 'forge' || i.environment === 'development')
  if (filter === 'approval') return issues.filter((i) => i.requiresApproval || i.status === 'waiting-approval')
  if (filter === 'devtools') return issues.filter((i) => i.source === 'devtools-healer' || i.checkName === 'devtools-dashboard')
  return issues
}

export default function SentinelPage({ searchParams }: { searchParams?: { filter?: string } }) {
  const filter = (FILTERS.find((f) => f.id === searchParams?.filter)?.id ?? 'all') as Filter
  const all = readIssues()
  const active = activeIssues(all)
  const summary = summarize(all)
  const tray = readTray()
  const tunnel = readTunnel()
  const provider = readProvider()
  const filtered = applyFilter(active, filter)

  const subsystems = [
    { name: 'Beacon', emoji: '🔆', state: tray.state ? 'running' : 'offline', href: '/sentinel' },
    { name: 'Forge', emoji: '🔥', state: heartbeatLiveness(readHeartbeat('forge')), href: '/forge' },
    { name: 'Guardian', emoji: '🛡', state: heartbeatLiveness(readHeartbeat('guardian')), href: '/guardian' },
    { name: 'Aegis', emoji: '⚔️', state: heartbeatLiveness(readHeartbeat('aegis')), href: '/aegis' },
    { name: 'Cortex', emoji: '🧠', state: 'running', href: '/cortex' }
  ]

  return (
    <section className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">🛡️ Sentinel</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            The intelligence platform for Docmee. Beacon watches it all. Forge builds it. Guardian runs it. Aegis protects it. Cortex directs it. Runs as an independent daemon — this dashboard is a read-only client of its log files.
          </p>
        </div>
        <a href="/sentinel-pwa/index.html" className="min-h-11 rounded-md border border-cyan-700 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-950/40">
          Open Mobile PWA
        </a>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {subsystems.map((s) => (
          <Link key={s.name} href={s.href} className={`rounded-md border p-4 ${livenessClass(s.state)}`}>
            <div className="text-sm font-semibold">
              {s.emoji} {s.name}
            </div>
            <div className="mt-1 text-xs capitalize opacity-80">{s.state}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Active" value={summary.active} />
        <Stat label="Critical" value={summary.critical} tone="red" />
        <Stat label="Warnings" value={summary.warning} tone="amber" />
        <Stat label="Needs approval" value={summary.approval} />
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              href={`/sentinel?filter=${f.id}`}
              className={`rounded-md border px-3 py-1.5 text-sm ${f.id === filter ? 'border-cyan-500/60 bg-cyan-950/30 text-cyan-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <IssueList issues={filtered} emptyLabel="No issues in this view." />
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Tunnel & Access</h2>
          <Link href="/settings" className="text-xs text-cyan-300 hover:underline">
            Tunnel Settings →
          </Link>
        </div>
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <div>
            <span className="text-slate-500">Mode:</span> <span className="text-slate-200">{tunnel.activeMode}</span>
          </div>
          <div>
            <span className="text-slate-500">Provider:</span> <span className="text-slate-200">{provider}</span>
          </div>
          <div className="truncate">
            <span className="text-slate-500">App:</span> <span className="text-slate-300">{tunnel.appUrl || '—'}</span>
          </div>
          <div className="truncate">
            <span className="text-slate-500">Webhook:</span> <span className="text-slate-300">{tunnel.webhookUrl || '—'}</span>
          </div>
        </div>
        {tunnel.webhookReminderPending && <p className="mt-3 text-xs text-amber-300">⚠️ WhatsApp webhook changed — update it in the Meta dashboard.</p>}
      </div>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'red' | 'amber' }) {
  const cls = tone === 'red' ? 'border-red-800 bg-red-950/20 text-red-200' : tone === 'amber' ? 'border-amber-800 bg-amber-950/20 text-amber-200' : 'border-slate-800 bg-slate-900 text-slate-100'
  return (
    <div className={`rounded-md border p-4 ${cls}`}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}
