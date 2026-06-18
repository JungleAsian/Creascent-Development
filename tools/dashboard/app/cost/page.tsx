import fs from 'node:fs'
import path from 'node:path'

const costFile = path.resolve(process.cwd(), '..', 'logs', 'cost.json')

type PageProps = { searchParams?: { message?: string; error?: string } }
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

function readDevelopmentCost() {
  if (!fs.existsSync(costFile)) return [] as DevCostEntry[]
  const data = JSON.parse(fs.readFileSync(costFile, 'utf8')) as CostStore
  return Array.isArray(data) ? [] : data.development ?? []
}

function money(value: number) {
  return `$${value.toFixed(4)}`
}

function sum(entries: DevCostEntry[], tool?: string) {
  return entries.filter((entry) => !tool || entry.tool === tool).reduce((total, entry) => total + entry.cost_usd, 0)
}

function tokenTotal(entry: DevCostEntry) {
  return entry.input_tokens + entry.output_tokens + entry.cached_tokens
}

export default function CostPage({ searchParams }: PageProps) {
  const development = readDevelopmentCost()
  const completedPhases = new Set(development.map((entry) => entry.phase))
  const devTotal = development.reduce((total, entry) => total + entry.cost_usd, 0)
  const totalMinutes = development.reduce((total, entry) => total + entry.session_minutes, 0)
  const totalTokens = development.reduce((total, entry) => total + tokenTotal(entry), 0)
  const avgPhase = completedPhases.size > 0 ? devTotal / completedPhases.size : 0
  const projection = avgPhase * 19
  const tools = ['claude-code', 'codex-pro', 'claude-chat']

  return (
    <section className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Development Cost</h1>
          <p className="mt-2 text-sm text-slate-400">Track the one-time build and development cost across phases, tools, tokens, and sessions.</p>
        </div>
        <form action="/api/actions" method="post">
          <input type="hidden" name="action" value="cost-dev-sync-claude" />
          <button className="min-h-11 rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950">Sync Claude Cost</button>
        </form>
      </div>
      {searchParams?.message && <p className="mt-2 text-sm text-emerald-300">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-2 text-sm text-red-300">{searchParams.error}</p>}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Cost to date</h2><p className="mt-2 text-3xl">{money(devTotal)}</p></div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Projected total</h2><p className="mt-2 text-3xl">~{money(projection)}</p></div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Phases tracked</h2><p className="mt-2 text-3xl">{completedPhases.size}/19</p></div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Session time</h2><p className="mt-2 text-3xl">{totalMinutes} min</p></div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Tokens tracked</h2><p className="mt-2 text-3xl">{totalTokens.toLocaleString()}</p></div>
      </div>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[420px_1fr]">
        <div className="space-y-5">
          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold">Cost by Tool</h2>
            <div className="mt-3 space-y-3">
              {tools.map((tool) => {
                const entries = development.filter((entry) => entry.tool === tool)
                const minutes = entries.reduce((total, entry) => total + entry.session_minutes, 0)
                return (
                  <div key={tool} className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-sm">{tool}</span>
                      <span className="font-semibold">{money(sum(development, tool))}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{entries.length} sessions · {minutes} minutes</p>
                  </div>
                )
              })}
            </div>
          </div>

          <form action="/api/actions" method="post" className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <input type="hidden" name="action" value="cost-dev-log" />
            <h2 className="text-sm font-semibold">Log Development Session</h2>
            <div className="mt-3 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="phase" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="P01" defaultValue="P01" />
                <input name="tool" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="claude-code" defaultValue="claude-code" />
              </div>
              <input name="feature" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="Feature or work area" />
              <input name="model" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="claude-sonnet" defaultValue="claude-sonnet" />
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="input" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="Input tokens" defaultValue="0" />
                <input name="output" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="Output tokens" defaultValue="0" />
                <input name="cached" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="Cached tokens" defaultValue="0" />
                <input name="minutes" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="Minutes" defaultValue="0" />
              </div>
              <input name="method" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="manual" defaultValue="manual" />
              <input name="notes" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" placeholder="Notes" />
              <button className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950">Log Session</button>
            </div>
          </form>
        </div>

        <div className="space-y-5">
          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold">Cost by Phase</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950"><tr><th className="p-3">Phase</th><th className="p-3">Claude Code</th><th className="p-3">Codex Pro</th><th className="p-3">Other</th><th className="p-3">Total</th><th className="p-3">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {phases.map((phase) => {
                    const phaseEntries = development.filter((entry) => entry.phase === phase)
                    const known = sum(phaseEntries, 'claude-code') + sum(phaseEntries, 'codex-pro')
                    return <tr key={phase}><td className="p-3 font-mono">{phase}</td><td className="p-3">{money(sum(phaseEntries, 'claude-code'))}</td><td className="p-3">{money(sum(phaseEntries, 'codex-pro'))}</td><td className="p-3">{money(Math.max(sum(phaseEntries) - known, 0))}</td><td className="p-3 font-semibold">{money(sum(phaseEntries))}</td><td className={phaseEntries.length > 0 ? 'p-3 text-emerald-300' : 'p-3 text-slate-400'}>{phaseEntries.length > 0 ? 'tracked' : 'pending'}</td></tr>
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold">Development Session Log</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950"><tr><th className="p-3">Timestamp</th><th className="p-3">Phase</th><th className="p-3">Feature</th><th className="p-3">Tool</th><th className="p-3">Model</th><th className="p-3">Minutes</th><th className="p-3">Tokens</th><th className="p-3">Cost</th><th className="p-3">Method</th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {development.slice(-80).reverse().map((entry) => <tr key={entry.id}><td className="p-3 text-slate-400">{new Date(entry.timestamp).toLocaleString()}</td><td className="p-3 font-mono">{entry.phase}</td><td className="p-3">{entry.feature}</td><td className="p-3">{entry.tool}</td><td className="p-3">{entry.model}</td><td className="p-3">{entry.session_minutes}</td><td className="p-3">{entry.input_tokens}/{entry.output_tokens}/{entry.cached_tokens}</td><td className="p-3">{money(entry.cost_usd)}</td><td className="p-3">{entry.capture_method}</td></tr>)}
                  {development.length === 0 && <tr><td className="p-3 text-slate-400" colSpan={9}>No development cost entries yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
