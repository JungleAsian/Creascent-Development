import fs from 'node:fs'
import path from 'node:path'

const toolsRoot = path.resolve(process.cwd(), '..')
const backlogFile = path.join(toolsRoot, 'logs', 'backlog.json')

type Task = {
  id: number
  phase: string
  priority: string
  title: string
  status: string
}

function tasks() {
  if (!fs.existsSync(backlogFile)) return []
  return JSON.parse(fs.readFileSync(backlogFile, 'utf8')) as Task[]
}

type PageProps = {
  searchParams?: { message?: string; error?: string }
}

function countBy(rows: Task[], key: keyof Pick<Task, 'status' | 'priority' | 'phase'>) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = row[key] || 'none'
    acc[value] = (acc[value] ?? 0) + 1
    return acc
  }, {})
}

function priorityTone(priority: string) {
  if (priority === 'critical' || priority === 'high') return 'bg-red-950/30 text-red-200 border-red-800'
  if (priority === 'medium') return 'bg-amber-950/30 text-amber-200 border-amber-800'
  if (priority === 'infrastructure') return 'bg-blue-900 text-blue-100 border-slate-700'
  return 'bg-slate-800 text-slate-300 border-slate-700'
}

function statusTone(status: string) {
  if (status === 'done') return 'bg-emerald-900 text-emerald-100'
  if (status === 'blocked') return 'bg-red-900 text-red-100'
  if (status === 'in-progress') return 'bg-amber-900 text-amber-100'
  return 'bg-slate-800 text-slate-300'
}

export default function BacklogPage({ searchParams }: PageProps) {
  const rows = tasks()
  const openRows = rows.filter((row) => row.status !== 'done')
  const doneRows = rows.filter((row) => row.status === 'done')
  const priorityCounts = countBy(rows, 'priority')
  const phaseCounts = countBy(openRows, 'phase')
  const statusCounts = countBy(rows, 'status')
  const nextTasks = openRows
    .sort((a, b) => {
      const weight: Record<string, number> = { critical: 0, high: 1, medium: 2, infrastructure: 3, low: 4 }
      return (weight[a.priority] ?? 5) - (weight[b.priority] ?? 5) || a.phase.localeCompare(b.phase) || a.id - b.id
    })
    .slice(0, 8)

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Backlog</h1>
          <p className="mt-2 text-sm text-slate-400">Organized by priority, phase, and completion so the next work is easy to see.</p>
          {searchParams?.message && <p className="mt-2 text-sm text-emerald-300">{searchParams.message}</p>}
          {searchParams?.error && <p className="mt-2 text-sm text-red-300">{searchParams.error}</p>}
        </div>
        <a href="#add-task" className="min-h-11 rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950">Add Task</a>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Open work</p>
          <p className="mt-2 text-3xl font-semibold">{openRows.length}</p>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Completed</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-300">{doneRows.length}</p>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Critical / high</p>
          <p className="mt-2 text-3xl font-semibold text-red-300">{(priorityCounts.critical ?? 0) + (priorityCounts.high ?? 0)}</p>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Active phases</p>
          <p className="mt-2 text-3xl font-semibold">{Object.keys(phaseCounts).length}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Next Work Queue</h2>
              <p className="mt-1 text-xs text-slate-400">Sorted by priority, then phase.</p>
            </div>
            <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">{nextTasks.length} shown</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {nextTasks.map((row) => (
              <article key={row.id} className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">#{row.id} · {row.phase}</p>
                    <h3 className="mt-1 text-sm font-semibold text-slate-100">{row.title}</h3>
                  </div>
                  <span className={`shrink-0 rounded border px-2 py-1 text-xs ${priorityTone(row.priority)}`}>{row.priority}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className={`rounded px-2 py-1 text-xs ${statusTone(row.status)}`}>{row.status}</span>
                  <form action="/api/actions" method="post">
                    <input type="hidden" name="action" value="backlog-done" />
                    <input type="hidden" name="id" value={row.id} />
                    <button disabled={row.status === 'done'} className="min-h-10 rounded border border-slate-700 px-3 py-1 text-xs disabled:cursor-not-allowed disabled:text-slate-600">Mark Done</button>
                  </form>
                </div>
              </article>
            ))}
            {nextTasks.length === 0 && <p className="text-sm text-slate-400">No open backlog items.</p>}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold">Status Summary</h2>
            <div className="mt-3 space-y-2">
              {Object.entries(statusCounts).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between rounded border border-slate-800 px-3 py-2 text-sm">
                  <span className={`rounded px-2 py-1 text-xs ${statusTone(status)}`}>{status}</span>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold">Open by Phase</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {Object.entries(phaseCounts).sort(([a], [b]) => a.localeCompare(b)).map(([phase, count]) => (
                <div key={phase} className="rounded border border-slate-800 px-3 py-2">
                  <p className="font-mono text-sm">{phase}</p>
                  <p className="text-xs text-slate-400">{count} open</p>
                </div>
              ))}
              {Object.keys(phaseCounts).length === 0 && <p className="text-sm text-slate-400">No open phases.</p>}
            </div>
          </div>
        </div>
      </div>

      <form id="add-task" action="/api/actions" method="post" className="mt-5 grid gap-3 rounded-md border border-slate-800 bg-slate-900 p-4 md:grid-cols-[1fr_120px_140px_auto]">
        <input type="hidden" name="action" value="backlog-add" />
        <input name="title" className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Task title" />
        <input name="phase" className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm" defaultValue="P01" />
        <select name="priority" className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm" defaultValue="medium">
          {['critical', 'high', 'medium', 'low', 'infrastructure'].map((priority) => <option key={priority}>{priority}</option>)}
        </select>
        <button className="min-h-11 rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950">Add Task</button>
      </form>

      <div className="mt-5 overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-300">
            <tr><th className="p-3">ID</th><th className="p-3">Phase</th><th className="p-3">Priority</th><th className="p-3">Status</th><th className="p-3">Task</th><th className="p-3" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((row) => (
              <tr key={row.id} className="bg-slate-950/60">
                <td className="p-3 font-mono text-xs text-slate-400">#{row.id}</td>
                <td className="p-3 font-mono">{row.phase}</td>
                <td className="p-3"><span className={`rounded border px-2 py-1 text-xs ${priorityTone(row.priority)}`}>{row.priority}</span></td>
                <td className="p-3"><span className={`rounded px-2 py-1 text-xs ${statusTone(row.status)}`}>{row.status}</span></td>
                <td className="p-3">{row.title}</td>
                <td className="p-3 text-right">
                  <form action="/api/actions" method="post">
                    <input type="hidden" name="action" value="backlog-done" />
                    <input type="hidden" name="id" value={row.id} />
                    <button disabled={row.status === 'done'} className="min-h-10 rounded border border-slate-700 px-3 py-1 text-xs disabled:cursor-not-allowed disabled:text-slate-600">Mark Done</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <a href="#add-task" className="fixed bottom-24 right-4 grid h-14 w-14 place-items-center rounded-full bg-cyan-500 text-2xl font-semibold text-slate-950 shadow-lg md:hidden">+</a>
    </section>
  )
}
