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

export default function BacklogPage({ searchParams }: PageProps) {
  const rows = tasks()
  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Backlog</h1>
          {searchParams?.message && <p className="mt-2 text-sm text-emerald-300">{searchParams.message}</p>}
          {searchParams?.error && <p className="mt-2 text-sm text-red-300">{searchParams.error}</p>}
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

      <div className="mt-5 space-y-3 md:hidden">
        {rows.map((row) => (
          <article key={row.id} className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">#{row.id} · {row.phase}</p>
                <h2 className="mt-1 text-sm font-semibold">{row.title}</h2>
              </div>
              <span className="rounded bg-slate-800 px-2 py-1 text-xs">{row.priority}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-sm text-slate-400">{row.status}</span>
              <form action="/api/actions" method="post">
                <input type="hidden" name="action" value="backlog-done" />
                <input type="hidden" name="id" value={row.id} />
                <button disabled={row.status === 'done'} className="min-h-11 rounded border border-slate-700 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:text-slate-600">Mark Done</button>
              </form>
            </div>
            <p className="mt-2 text-xs text-slate-500">Swipe actions pending: use Mark Done until edit gestures are enabled.</p>
          </article>
        ))}
      </div>

      <table className="mt-5 hidden w-full overflow-hidden rounded-lg text-left text-sm md:table">
        <thead className="bg-slate-900 text-slate-300">
          <tr><th className="p-3">ID</th><th>Phase</th><th>Priority</th><th>Title</th><th>Status</th><th /></tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row) => (
            <tr key={row.id} className="bg-slate-950/60">
              <td className="p-3">{row.id}</td>
              <td>{row.phase}</td>
              <td><span className="rounded bg-slate-800 px-2 py-1">{row.priority}</span></td>
              <td>{row.title}</td>
              <td>{row.status}</td>
              <td>
                <form action="/api/actions" method="post">
                  <input type="hidden" name="action" value="backlog-done" />
                  <input type="hidden" name="id" value={row.id} />
                  <button disabled={row.status === 'done'} className="min-h-11 rounded border border-slate-700 px-3 py-2 disabled:cursor-not-allowed disabled:text-slate-600">Mark Done</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <a href="#add-task" className="fixed bottom-24 right-4 grid h-14 w-14 place-items-center rounded-full bg-cyan-500 text-2xl font-semibold text-slate-950 shadow-lg md:hidden">+</a>
    </section>
  )
}
