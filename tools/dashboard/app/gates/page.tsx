import fs from 'node:fs'
import path from 'node:path'
import { AutoRefresh } from '../auto-refresh'

const gates = ['Typecheck', 'Lint', 'Unit tests', 'RLS cross-clinic', 'Env', 'DAL']
const gatesFile = path.resolve(process.cwd(), '..', 'logs', 'six-gates.json')

type GateResult = { gate: number; name: string; ok: boolean; detail: string }
type GateStore = { generatedAt?: string; ok?: boolean; results?: GateResult[] }
type PageProps = {
  searchParams?: { message?: string; error?: string }
}

function readGates(): GateStore {
  if (!fs.existsSync(gatesFile)) return {}
  return JSON.parse(fs.readFileSync(gatesFile, 'utf8')) as GateStore
}

export default function GatesPage({ searchParams }: PageProps) {
  const store = readGates()
  const byGate = new Map((store.results ?? []).map((result) => [result.gate, result]))

  return (
    <section className="w-full">
      <AutoRefresh seconds={15} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Six Gates</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            These checks now run automatically before an automated build starts and after phase work completes. Use this page to review or manually re-check.
          </p>
          {store.generatedAt && <p className="mt-2 text-xs text-slate-500">Last checked: {new Date(store.generatedAt).toLocaleString()}</p>}
          {searchParams?.message && <p className="mt-2 text-sm text-emerald-300">{searchParams.message}</p>}
          {searchParams?.error && <p className="mt-2 text-sm text-red-300">{searchParams.error}</p>}
        </div>
        <form action="/api/actions" method="post">
          <input type="hidden" name="action" value="gates-run" />
          <button className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950">Run Check Now</button>
        </form>
      </div>

      <div className={`mt-5 rounded-md border p-4 ${store.generatedAt ? store.ok ? 'border-emerald-700/60 bg-emerald-950/20' : 'border-red-700/60 bg-red-950/20' : 'border-slate-800 bg-slate-900'}`}>
        <div className="text-sm font-medium">{store.generatedAt ? store.ok ? 'All gates passed' : 'One or more gates need attention' : 'No gate result yet'}</div>
        <p className="mt-1 text-sm text-slate-400">
          DevTools blocks automated progress when a required gate fails.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {gates.map((gate, index) => {
          const result = byGate.get(index + 1)
          const stateClass = result
            ? result.ok
              ? 'border-emerald-800/70 bg-emerald-950/20'
              : 'border-red-800/70 bg-red-950/20'
            : 'border-slate-800 bg-slate-900'
          return (
            <div key={gate} className={`rounded-md border p-5 ${stateClass}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-400">Gate {index + 1}</p>
                <span className={result ? result.ok ? 'text-xs text-emerald-300' : 'text-xs text-red-300' : 'text-xs text-slate-500'}>
                  {result ? result.ok ? 'Passed' : 'Blocked' : 'Not checked'}
                </span>
              </div>
              <h2 className="mt-1 font-semibold">{gate}</h2>
              <p className="mt-3 line-clamp-4 text-sm text-slate-400">{result?.detail?.trim() || 'This gate will be checked automatically.'}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
