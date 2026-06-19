import { readProvider } from '../lib/sentinel-platform'

export const dynamic = 'force-dynamic'

const PROVIDERS = [
  { id: 'claude-code', name: 'Claude Code', model: 'Claude Max session' },
  { id: 'codex', name: 'Codex', model: 'codex-1' },
  { id: 'local-model', name: 'Local Model', model: 'Ollama / LM Studio' }
]

const AGENTS = [
  { role: 'Diagnostics agent', direct: true },
  { role: 'Dashboard/UI agent', direct: false },
  { role: 'CLI/Build agent', direct: false },
  { role: 'Git/GitHub agent', direct: false },
  { role: 'Claude Session agent', direct: true },
  { role: 'Notion Integration agent', direct: true },
  { role: 'Deployment agent', direct: false }
]

export default function CortexPage() {
  const active = readProvider()

  return (
    <section className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">🧠 Cortex</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Agent provider control — which AI runs, which agent handles which issue, and when to switch. Cortex reads credentials from DevTools{' '}
          <a className="text-cyan-300 hover:underline" href="/agents">
            /agents
          </a>{' '}
          and adds provider selection, per-agent overrides, and the guided switch flow. Switching is performed by the daemon (pnpm sentinel cortex switch &lt;provider&gt;) so in-flight executions are handled safely.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {PROVIDERS.map((p) => (
          <div key={p.id} className={`rounded-md border p-4 ${p.id === active ? 'border-cyan-500/60 bg-cyan-950/20' : 'border-slate-800 bg-slate-900'}`}>
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-slate-100">{p.name}</div>
              {p.id === active && <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-200">Active</span>}
            </div>
            <div className="mt-1 text-xs text-slate-500">{p.model}</div>
            <div className="mt-3 text-xs text-slate-400">Connection + live session status shown by the daemon API (GET /api/cortex).</div>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-semibold">Per-Agent Providers</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="border-b border-slate-800 px-3 py-2">Agent</th>
              <th className="border-b border-slate-800 px-3 py-2">Provider</th>
            </tr>
          </thead>
          <tbody>
            {AGENTS.map((a) => (
              <tr key={a.role} className="border-b border-slate-800/70">
                <td className="px-3 py-2 text-slate-200">{a.role}</td>
                <td className="px-3 py-2 text-slate-400">{a.direct ? 'Direct Call (no AI provider)' : `Global (${active})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500">Direct-call agents (Diagnostics, Session, Notion) never invoke an AI provider — zero token cost.</p>
      </div>
    </section>
  )
}
