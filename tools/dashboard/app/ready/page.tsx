import fs from 'node:fs'
import path from 'node:path'

const readyFile = path.resolve(process.cwd(), '..', 'logs', 'ready.json')

type ReadyCheck = { name: string; status: 'pass' | 'warning' | 'critical'; message: string; fix?: string }
type ReadyCategory = { id: string; label: string; checks: ReadyCheck[] }
type ReadyResult = {
  createdAt?: string
  ready?: boolean
  summary?: { pass: number; warning: number; critical: number }
  categories?: ReadyCategory[]
}
type PageProps = { searchParams?: { message?: string; error?: string } }

function readReady(): ReadyResult {
  if (!fs.existsSync(readyFile)) return { ready: false, summary: { pass: 0, warning: 0, critical: 1 }, categories: [] }
  try {
    return JSON.parse(fs.readFileSync(readyFile, 'utf8')) as ReadyResult
  } catch {
    return { ready: false, summary: { pass: 0, warning: 0, critical: 1 }, categories: [] }
  }
}

function statusClass(status: string) {
  if (status === 'pass') return 'text-emerald-300'
  if (status === 'warning') return 'text-amber-300'
  return 'text-red-300'
}

export default function ReadyPage({ searchParams }: PageProps) {
  const data = readReady()
  const ready = Boolean(data.ready)
  const summary = data.summary ?? { pass: 0, warning: 0, critical: 1 }

  return (
    <section className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Readiness Gate</h1>
          <p className="mt-2 text-sm text-slate-400">Final check before starting the Docmee build.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action="/api/actions" method="post"><input type="hidden" name="action" value="ready-run" /><button className="min-h-11 rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-950">Run Ready Check</button></form>
          <form action="/api/actions" method="post"><input type="hidden" name="action" value="ready-fix" /><button className="min-h-11 rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">Auto-Fix Local Items</button></form>
        </div>
      </div>
      {searchParams?.message && <p className="mt-3 text-sm text-emerald-300">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-3 text-sm text-red-300">{searchParams.error}</p>}

      <div className={ready ? 'mt-6 rounded-md border border-emerald-700 bg-emerald-950/40 p-5' : 'mt-6 rounded-md border border-red-800 bg-red-950/40 p-5'}>
        <h2 className="text-lg font-semibold">{ready ? 'DEVTOOLS READY' : 'NOT READY'}</h2>
        <p className="mt-2 text-sm text-slate-300">{summary.pass} passed · {summary.warning} warnings · {summary.critical} critical</p>
        {data.createdAt && <p className="mt-1 text-xs text-slate-500">Last checked {new Date(data.createdAt).toLocaleString()}</p>}
        {ready && (
          <form action="/api/actions" method="post" className="mt-4">
            <input type="hidden" name="action" value="phase-build-watch" />
            <input type="hidden" name="from" value="P01" />
            <button className="min-h-11 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white">Start Automated Build</button>
          </form>
        )}
      </div>

      <div className="mt-6 grid gap-4">
        {(data.categories ?? []).map((category) => {
          const critical = category.checks.filter((check) => check.status === 'critical').length
          const warnings = category.checks.filter((check) => check.status === 'warning').length
          return (
            <details key={category.id} open={critical > 0} className="rounded-md border border-slate-800 bg-slate-900">
              <summary className="cursor-pointer select-none px-4 py-3">
                <span className="text-sm font-semibold">{category.label}</span>
                <span className={critical > 0 ? 'ml-3 text-sm text-red-300' : warnings > 0 ? 'ml-3 text-sm text-amber-300' : 'ml-3 text-sm text-emerald-300'}>
                  {critical > 0 ? `${critical} critical` : warnings > 0 ? `${warnings} warnings` : 'ready'}
                </span>
              </summary>
              <div className="grid gap-2 border-t border-slate-800 p-4">
                {category.checks.map((check) => (
                  <div key={check.name} className="rounded border border-slate-800 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-slate-200">{check.name}</span>
                      <span className={`text-sm ${statusClass(check.status)}`}>{check.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{check.message}</p>
                    {check.fix && <p className="mt-1 text-xs text-sky-300">{check.fix}</p>}
                  </div>
                ))}
              </div>
            </details>
          )
        })}
        {(data.categories ?? []).length === 0 && <p className="rounded-md border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">Run the ready check to populate this page.</p>}
      </div>
    </section>
  )
}

