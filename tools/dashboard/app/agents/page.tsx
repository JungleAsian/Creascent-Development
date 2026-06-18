import fs from 'node:fs'
import path from 'node:path'

const logsDir = path.resolve(process.cwd(), '..', 'logs')
const agentsFile = path.join(logsDir, 'agents.json')
const envFile = path.resolve(process.cwd(), '..', '.env.tools')

type Agent = {
  id: string
  role: string
  label: string
  service: string
  model: string
  mode: string
  trigger: string
  enabled: boolean
  core: boolean
  prompt: string
  lastRun?: { phase?: string; status: string; createdAt: string }
}
type PageProps = { searchParams?: { message?: string; error?: string } }

const services = [
  ['claude-code', 'Claude Code', 'CLI', ''],
  ['claude-api', 'Claude API live runtime', 'API later', 'ANTHROPIC_API_KEY'],
  ['codex-pro', 'Codex Pro', 'Manual', 'OPENAI_API_KEY'],
  ['gpt-4o', 'GPT-4o', 'API', 'OPENAI_API_KEY'],
  ['google-gemini', 'Gemini', 'API', 'GOOGLE_GEMINI_API_KEY'],
  ['mistral', 'Mistral', 'API', 'MISTRAL_API_KEY'],
  ['deepseek', 'DeepSeek', 'API', 'DEEPSEEK_API_KEY'],
  ['custom', 'Custom', 'API', 'CUSTOM_AI_API_KEY']
]

function readAgents() {
  if (!fs.existsSync(agentsFile)) return []
  return JSON.parse(fs.readFileSync(agentsFile, 'utf8')) as Agent[]
}

function readEnv() {
  if (!fs.existsSync(envFile)) return {}
  return Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter((line) => line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1)]
  }))
}

function agentMode(agent: Agent) {
  return agent.service === 'claude-code' ? 'cli' : agent.mode
}

export default function AgentsPage({ searchParams }: PageProps) {
  const agents = readAgents()
  const env = readEnv()
  const core = agents.filter((agent) => agent.core)
  const additional = agents.filter((agent) => !agent.core)
  const pipeline = agents.filter((agent) => agent.enabled)

  return (
    <section className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">AI Agents</h1>
          <p className="mt-2 text-sm text-slate-400">Claude Code runs the build automatically. No API key is needed for the development build.</p>
        </div>
        <form action="/api/actions" method="post">
          <input type="hidden" name="action" value="agents-reset" />
          <button className="rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">Reset Defaults</button>
        </form>
      </div>
      {searchParams?.message && <p className="mt-2 text-sm text-emerald-300">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-2 text-sm text-red-300">{searchParams.error}</p>}
      <div className="mt-4 rounded-md border border-cyan-800 bg-cyan-950/30 p-4 text-sm text-cyan-100">
        Full automation requires the local Claude Code command to be installed and signed in with Claude Max.
      </div>

      {agents.length === 0 && (
        <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm text-slate-300">Agent configuration has not been initialized yet.</p>
          <form action="/api/actions" method="post" className="mt-3"><input type="hidden" name="action" value="agents-reset" /><button className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white">Create Agent Config</button></form>
        </div>
      )}

      <h2 className="mt-6 text-sm font-semibold">Core Agents</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {core.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
      </div>

      <h2 className="mt-6 text-sm font-semibold">Additional Agents</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {additional.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
      </div>

      <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold">Service Credentials</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {services.map(([id, label, mode, key]) => (
            <div key={id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 px-3 py-2">
              <div><span className="text-sm">{label}</span><span className="ml-2 text-xs text-slate-500">{mode}</span></div>
              <div className="flex items-center gap-2">
                <span className={key ? env[key] ? 'text-sm text-emerald-300' : 'text-sm text-amber-300' : 'text-sm text-sky-300'}>{key ? env[key] ? 'ready' : 'missing key' : 'local/manual'}</span>
                <form action="/api/actions" method="post">
                  <input type="hidden" name="action" value="agents-test" />
                  <input type="hidden" name="service" value={id} />
                  <button className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800">Test</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold">Pipeline</h2>
        <div className="mt-3 space-y-2">
          <div className="rounded border border-slate-800 px-3 py-2 text-sm text-slate-300">Sync Notion prompts</div>
          {pipeline.map((agent) => <div key={agent.id} className="rounded border border-slate-800 px-3 py-2 text-sm text-slate-300">{agent.label} - {agent.service} - {agent.trigger}</div>)}
          <div className="rounded border border-slate-800 px-3 py-2 text-sm text-slate-300">pnpm tool gates check</div>
        </div>
      </div>
    </section>
  )
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{agent.label}</h3>
          <p className="mt-1 text-xs text-slate-500">{agent.role}</p>
        </div>
        <span className={agent.enabled ? 'text-sm text-emerald-300' : 'text-sm text-slate-500'}>{agent.enabled ? 'enabled' : 'disabled'}</span>
      </div>
      <div className="mt-3 space-y-1 text-sm text-slate-300">
        <p>Service: {agent.service}</p>
        <p>Model: {agent.model}</p>
        <p>Mode: {agentMode(agent)}</p>
        <p>Trigger: {agent.trigger}</p>
        {agent.lastRun && <p className="text-xs text-slate-500">Last run: {agent.lastRun.status} {agent.lastRun.phase ?? ''}</p>}
      </div>
      <p className="mt-3 text-xs text-slate-400">{agent.prompt}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <form action="/api/actions" method="post"><input type="hidden" name="action" value={agent.enabled ? 'agents-disable' : 'agents-enable'} /><input type="hidden" name="role" value={agent.role} /><button disabled={agent.core && agent.enabled} className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600">{agent.enabled ? 'Disable' : 'Enable'}</button></form>
        <form action="/api/actions" method="post"><input type="hidden" name="action" value="agents-run" /><input type="hidden" name="role" value={agent.role} /><input type="hidden" name="phase" value="P01" /><button className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800">Run</button></form>
      </div>
    </div>
  )
}
