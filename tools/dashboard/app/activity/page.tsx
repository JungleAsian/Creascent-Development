import path from 'node:path'
import { readJson } from '../lib/read-json'
import { AutoRefresh } from '../auto-refresh'

export const dynamic = 'force-dynamic'

type Severity = 'info' | 'success' | 'warn' | 'error'
type ActivityEvent = {
  id: string
  ts: string
  actor: string
  event: string
  severity: Severity
  message: string
  taskId?: number
  source?: string
  link?: string
}

const toolsRoot = path.resolve(process.cwd(), '..')
const activityFile = path.join(toolsRoot, 'logs', 'activity.json')

const tone: Record<Severity, string> = {
  info: 'border-slate-700 text-slate-300',
  success: 'border-emerald-700 text-emerald-300',
  warn: 'border-amber-700 text-amber-300',
  error: 'border-red-700 text-red-300'
}
const dot: Record<Severity, string> = {
  info: 'bg-slate-400',
  success: 'bg-emerald-400',
  warn: 'bg-amber-400',
  error: 'bg-red-400'
}

function when(ts: string) {
  const then = Date.parse(ts)
  if (!Number.isFinite(then)) return ts
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(then).toLocaleString()
}

export default function ActivityPage({ searchParams }: { searchParams?: { actor?: string; severity?: string } }) {
  const all = readJson<ActivityEvent[]>(activityFile, [])
  const actors = [...new Set(all.map((e) => e.actor))].sort()
  const fActor = searchParams?.actor
  const fSeverity = searchParams?.severity as Severity | undefined

  let events = all.slice().reverse()
  if (fActor) events = events.filter((e) => e.actor === fActor)
  if (fSeverity) events = events.filter((e) => e.severity === fSeverity)
  events = events.slice(0, 200)

  const counts = {
    success: all.filter((e) => e.severity === 'success').length,
    warn: all.filter((e) => e.severity === 'warn').length,
    error: all.filter((e) => e.severity === 'error').length
  }

  const chip = (href: string, label: string, active: boolean) => (
    <a href={href} className={`rounded-md border px-2.5 py-1 ${active ? 'border-cyan-600 bg-cyan-950/40 text-cyan-100' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}>{label}</a>
  )

  return (
    <section className="mx-auto max-w-4xl w-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Activity</h1>
          <p className="mt-1 text-sm text-slate-400">A durable, chronological feed of what every AI/tool did — resolve, draft, verify, approve, stop. Newest first.</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>{all.length} events</div>
          <div className="mt-0.5">{counts.success} ok · <span className="text-amber-300">{counts.warn} warn</span> · <span className="text-red-300">{counts.error} err</span></div>
        </div>
      </div>

      <AutoRefresh seconds={10} />

      <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
        {chip('/activity', 'All', !fActor && !fSeverity)}
        <span className="mx-1 text-slate-700">|</span>
        {(['success', 'warn', 'error'] as Severity[]).map((s) => chip(`/activity?severity=${s}`, s, fSeverity === s))}
        {actors.length > 0 && <span className="mx-1 text-slate-700">|</span>}
        {actors.map((a) => chip(`/activity?actor=${encodeURIComponent(a)}`, `@${a}`, fActor === a))}
      </div>

      <ol className="mt-3 overflow-hidden rounded-lg border border-slate-800">
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-3 border-b border-slate-800 bg-slate-900/40 px-4 py-2.5 last:border-b-0">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[e.severity]}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-100">{e.message}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                <span className={`rounded border px-1.5 ${tone[e.severity]}`}>{e.severity}</span>
                <span className="font-medium text-slate-300">@{e.actor}</span>
                <span className="font-mono">{e.event}</span>
                {e.source && <span>· {e.source}</span>}
                {typeof e.taskId === 'number' && <a href={`/backlog`} className="text-cyan-300 underline">#{e.taskId}</a>}
                {e.link && <a href={e.link} target="_blank" rel="noreferrer" className="text-cyan-300 underline">link ↗</a>}
              </p>
            </div>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-500" title={e.ts}>{when(e.ts)}</span>
          </li>
        ))}
        {events.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-slate-400">No activity yet. Resolve, verify, or approve a backlog item and it will show up here.</li>
        )}
      </ol>
    </section>
  )
}
