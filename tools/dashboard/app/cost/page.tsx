import fs from 'node:fs'
import Link from 'next/link'
import path from 'node:path'

const costFile = path.resolve(process.cwd(), '..', 'logs', 'cost.json')
type PageProps = { searchParams?: { message?: string; error?: string; tab?: string } }
type RuntimeCostEntry = { provider: string; usd: number; createdAt: string; input?: number; output?: number; tokens?: number; minutes?: number }
type DevCostEntry = {
  id: string
  timestamp: string
  phase: string
  feature: string
  tool: string
  model: string
  session_minutes: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  cost_usd: number
  capture_method: string
  notes: string
}
type CostStore = RuntimeCostEntry[] | { runtime?: RuntimeCostEntry[]; development?: DevCostEntry[] }

const phases = Array.from({ length: 19 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`)

function readStore() {
  if (!fs.existsSync(costFile)) return { runtime: [], development: [] as DevCostEntry[] }
  const data = JSON.parse(fs.readFileSync(costFile, 'utf8')) as CostStore
  if (Array.isArray(data)) return { runtime: data, development: [] as DevCostEntry[] }
  return { runtime: data.runtime ?? [], development: data.development ?? [] }
}

function money(value: number) {
  return `$${value.toFixed(4)}`
}

function sum(entries: DevCostEntry[], tool?: string) {
  return entries.filter((entry) => !tool || entry.tool === tool).reduce((total, entry) => total + entry.cost_usd, 0)
}

export default function CostPage({ searchParams }: PageProps) {
  const tab = searchParams?.tab === 'development' ? 'development' : 'runtime'
  const today = new Date().toISOString().split('T')[0]
  const { runtime, development } = readStore()
  const todaySpend = runtime.filter((entry) => entry.createdAt.startsWith(today)).reduce((total, entry) => total + entry.usd, 0)
  const runtimeByProvider = runtime.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.provider] = (acc[entry.provider] ?? 0) + entry.usd
    return acc
  }, {})
  const completedPhases = new Set(development.map((entry) => entry.phase))
  const devTotal = development.reduce((total, entry) => total + entry.cost_usd, 0)
  const avgPhase = completedPhases.size > 0 ? devTotal / completedPhases.size : 0
  const projection = avgPhase * 19

  return (
    <section className="max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cost</h1>
          <p className="mt-2 text-sm text-slate-400">Track runtime provider spend and one-time development build cost separately.</p>
        </div>
        <div className="flex rounded-md border border-slate-800 bg-slate-900 p-1">
          <Link href="/cost" className={`rounded px-3 py-2 text-sm ${tab === 'runtime' ? 'bg-slate-100 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}>Runtime Cost</Link>
          <Link href="/cost?tab=development" className={`rounded px-3 py-2 text-sm ${tab === 'development' ? 'bg-slate-100 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}>Development Cost</Link>
        </div>
      </div>
      {searchParams?.message && <p className="mt-2 text-sm text-emerald-300">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-2 text-sm text-red-300">{searchParams.error}</p>}

      {tab === 'runtime' ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">Today</h2><p className="mt-4 text-3xl">{money(todaySpend)}</p></div>
          <form action="/api/actions" method="post" className="rounded-md border border-slate-800 bg-slate-900 p-5">
            <input type="hidden" name="action" value="cost-log" />
            <h2 className="font-semibold">Log Runtime Entry</h2>
            <input name="provider" className="mt-4 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="Provider" />
            <input name="tokens" className="mt-3 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="Tokens" defaultValue="0" />
            <button className="mt-3 rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950">Log Cost</button>
          </form>
          <div className="rounded-md border border-slate-800 bg-slate-900 p-5 md:col-span-2">
            <h2 className="font-semibold">Runtime by Provider</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              {Object.entries(runtimeByProvider).map(([provider, total]) => <div key={provider} className="rounded border border-slate-800 px-3 py-2"><p className="text-sm text-slate-400">{provider}</p><p className="mt-1 text-lg">{money(total)}</p></div>)}
              {Object.keys(runtimeByProvider).length === 0 && <p className="text-sm text-slate-400">No runtime entries yet.</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ['Claude Code', 'claude-code'],
              ['Codex Pro', 'codex-pro'],
              ['Claude Chat', 'claude-chat']
            ].map(([label, tool]) => {
              const entries = development.filter((entry) => entry.tool === tool)
              const minutes = entries.reduce((total, entry) => total + entry.session_minutes, 0)
              return <div key={tool} className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">{label}</h2><p className="mt-2 text-2xl">{money(sum(development, tool))}</p><p className="mt-1 text-sm text-slate-400">{entries.length} sessions · {minutes} min</p></div>
            })}
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Phases complete</h2><p className="mt-2 text-2xl">{completedPhases.size}/19</p></div>
            <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Cost to date</h2><p className="mt-2 text-2xl">{money(devTotal)}</p></div>
            <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Avg cost/phase</h2><p className="mt-2 text-2xl">{money(avgPhase)}</p></div>
            <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Projected total</h2><p className="mt-2 text-2xl">~{money(projection)}</p></div>
          </div>

          <form action="/api/actions" method="post" className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <input type="hidden" name="action" value="cost-dev-log" />
            <h2 className="text-sm font-semibold">Log Development Session</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <input name="phase" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="P01" defaultValue="P01" />
              <input name="feature" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="P01/monorepo-scaffold" />
              <input name="tool" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="codex-pro" defaultValue="codex-pro" />
              <input name="model" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="o3" defaultValue="o3" />
              <input name="input" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="Input tokens" defaultValue="0" />
              <input name="output" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="Output tokens" defaultValue="0" />
              <input name="cached" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="Cached tokens" defaultValue="0" />
              <input name="minutes" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="Minutes" defaultValue="0" />
              <input name="method" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="manual" defaultValue="manual" />
              <input name="notes" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm md:col-span-2" placeholder="Notes" />
              <button className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950">Log Session</button>
            </div>
          </form>

          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold">Cost by Phase</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950"><tr><th className="p-3">Phase</th><th className="p-3">Claude Code</th><th className="p-3">Codex Pro</th><th className="p-3">Total</th><th className="p-3">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {phases.map((phase) => {
                    const phaseEntries = development.filter((entry) => entry.phase === phase)
                    return <tr key={phase}><td className="p-3 font-mono">{phase}</td><td className="p-3">{money(sum(phaseEntries, 'claude-code'))}</td><td className="p-3">{money(sum(phaseEntries, 'codex-pro'))}</td><td className="p-3">{money(sum(phaseEntries))}</td><td className="p-3 text-slate-400">{phaseEntries.length > 0 ? 'tracked' : 'pending'}</td></tr>
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold">Session Log</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950"><tr><th className="p-3">Timestamp</th><th className="p-3">Phase</th><th className="p-3">Feature</th><th className="p-3">Tool</th><th className="p-3">Tokens</th><th className="p-3">Cost</th><th className="p-3">Method</th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {development.slice(-20).reverse().map((entry) => <tr key={entry.id}><td className="p-3 text-slate-400">{new Date(entry.timestamp).toLocaleString()}</td><td className="p-3 font-mono">{entry.phase}</td><td className="p-3">{entry.feature}</td><td className="p-3">{entry.tool}</td><td className="p-3">{entry.input_tokens}/{entry.output_tokens}/{entry.cached_tokens}</td><td className="p-3">{money(entry.cost_usd)}</td><td className="p-3">{entry.capture_method}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
