import path from 'node:path'
import Link from 'next/link'
import { readJson } from '../lib/read-json'
import { isProcessAlive, isHeartbeatFresh } from '../lib/run-live'
import { AutoRefresh } from '../auto-refresh'

export const dynamic = 'force-dynamic'

type Task = { id: number; status: string; title: string }
type RunState = { status?: string; pid?: number; heartbeatAt?: string; message?: string; currentId?: number }
type Severity = 'info' | 'success' | 'warn' | 'error'
type ActivityEvent = { id: string; ts: string; actor: string; event: string; severity: Severity; message: string; taskId?: number }
type JournalEntry = { id: string; type: string; title: string; pinned?: boolean; ts: string }
type Agent = { id: string; label: string; enabled: boolean; service: string }

const toolsRoot = path.resolve(process.cwd(), '..')
const f = (name: string) => path.join(toolsRoot, 'logs', name)

const dot: Record<Severity, string> = { info: 'bg-slate-400', success: 'bg-emerald-400', warn: 'bg-amber-400', error: 'bg-red-400' }

function rel(ts: string) {
  const t = Date.parse(ts)
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

export default function OverviewPage() {
  const tasks = readJson<Task[]>(f('backlog.json'), [])
  const run = readJson<RunState>(f('backlog-run.json'), {})
  const activity = readJson<ActivityEvent[]>(f('activity.json'), [])
  const journal = readJson<JournalEntry[]>(f('journal.json'), [])
  const agents = readJson<Agent[]>(f('agents.json'), [])

  const runLive = run.status === 'running' && isProcessAlive(run.pid) && isHeartbeatFresh(run.heartbeatAt)
  const count = (s: string) => tasks.filter((t) => t.status === s).length
  const todo = count('todo')
  const review = count('review')
  const done = count('done')
  const blocked = count('blocked') + count('in-progress') + count('plan-review')
  const recent = activity.slice().reverse().slice(0, 6)
  const pinned = journal.filter((e) => e.pinned).slice(0, 4)
  const enabledAgents = agents.filter((a) => a.enabled).length

  const stat = (label: string, value: number | string, href: string, tone = 'text-slate-100') => (
    <Link href={href} className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 hover:border-slate-700">
      <div className={`text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-400">{label}</div>
    </Link>
  )

  return (
    <section className="mx-auto max-w-5xl w-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mission Control</h1>
          <p className="mt-1 text-sm text-slate-400">What the AI stack is doing right now — backlog, live runs, activity, and memory at a glance.</p>
        </div>
        <span className={`rounded-md border px-2.5 py-1 text-xs font-medium ${runLive ? 'border-cyan-600 bg-cyan-950/40 text-cyan-100' : 'border-slate-700 text-slate-400'}`}>
          {runLive ? '● running' : '○ idle'}
        </span>
      </div>

      <AutoRefresh seconds={10} />

      {/* Live run banner */}
      {runLive && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-cyan-900 bg-cyan-950/20 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-cyan-100">{run.message ?? 'Working…'}</p>
            {typeof run.currentId === 'number' && <p className="text-xs text-cyan-300/80">item #{run.currentId}</p>}
          </div>
          <form action="/api/actions" method="post">
            <input type="hidden" name="action" value="backlog-stop" />
            <button className="shrink-0 rounded-md border border-red-700 bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-950/50">Stop run</button>
          </form>
        </div>
      )}

      {/* Stat tiles */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stat('Open todo', todo, '/backlog?status=todo', todo > 0 ? 'text-cyan-300' : 'text-slate-100')}
        {stat('In review', review, '/backlog?status=review', review > 0 ? 'text-amber-300' : 'text-slate-100')}
        {stat('Done', done, '/backlog?status=done', 'text-emerald-300')}
        {stat('Needs attention', blocked, '/backlog', blocked > 0 ? 'text-red-300' : 'text-slate-100')}
        {stat('Agents enabled', `${enabledAgents}/${agents.length}`, '/agents')}
      </div>

      {/* Quick launch */}
      <div className="mt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quick launch</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <form action="/api/actions" method="post">
            <input type="hidden" name="action" value="backlog-auto-resolve" />
            <button disabled={runLive || todo === 0} className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50" title={todo === 0 ? 'No open todo items' : `Resolve all ${todo} todo item(s)`}>Auto-resolve all{todo > 0 ? ` (${todo})` : ''}</button>
          </form>
          <form action="/api/actions" method="post">
            <input type="hidden" name="action" value="backlog-verify-all" />
            <button disabled={runLive || review === 0} className="rounded-md border border-sky-700 bg-sky-950/30 px-3 py-2 text-sm font-medium text-sky-100 hover:bg-sky-950/60 disabled:cursor-not-allowed disabled:opacity-50" title={review === 0 ? 'No items in review' : `Verify all ${review} item(s)`}>Verify all{review > 0 ? ` (${review})` : ''}</button>
          </form>
          <form action="/api/actions" method="post">
            <input type="hidden" name="action" value="backlog-sync" />
            <button disabled={runLive} className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">Sync backlog</button>
          </form>
          <Link href="/ready" className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Readiness</Link>
          <Link href="/journal" className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">+ Journal note</Link>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Recent activity */}
        <div className="rounded-lg border border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
            <h2 className="text-sm font-medium text-slate-200">Recent activity</h2>
            <Link href="/activity" className="text-xs text-cyan-300 underline">View all</Link>
          </div>
          <ul className="divide-y divide-slate-800">
            {recent.map((e) => (
              <li key={e.id} className="flex items-start gap-2 px-4 py-2">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[e.severity]}`} aria-hidden="true" />
                <p className="min-w-0 flex-1 truncate text-xs text-slate-200">{e.message}</p>
                <span className="shrink-0 text-[11px] text-slate-500">{rel(e.ts)}</span>
              </li>
            ))}
            {recent.length === 0 && <li className="px-4 py-6 text-center text-xs text-slate-500">No activity yet.</li>}
          </ul>
        </div>

        {/* Pinned journal */}
        <div className="rounded-lg border border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
            <h2 className="text-sm font-medium text-slate-200">Pinned memory</h2>
            <Link href="/journal" className="text-xs text-cyan-300 underline">Journal</Link>
          </div>
          <ul className="divide-y divide-slate-800">
            {pinned.map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-4 py-2">
                <span className="rounded border border-slate-700 px-1.5 text-[11px] text-slate-400">{e.type}</span>
                <p className="min-w-0 flex-1 truncate text-xs text-slate-200">{e.title}</p>
              </li>
            ))}
            {pinned.length === 0 && <li className="px-4 py-6 text-center text-xs text-slate-500">No pinned entries. Pin decisions/blockers in the Journal.</li>}
          </ul>
        </div>
      </div>
    </section>
  )
}
