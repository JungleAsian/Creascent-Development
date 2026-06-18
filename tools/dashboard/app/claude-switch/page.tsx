import fs from 'node:fs'
import path from 'node:path'

const toolsRoot = path.resolve(process.cwd(), '..')
const buildRunFile = path.join(toolsRoot, 'logs', 'build-run.json')
const readyFile = path.join(toolsRoot, 'logs', 'ready.json')
const phasesFile = path.join(toolsRoot, 'logs', 'phases.json')
const guardFile = path.join(toolsRoot, 'logs', 'claude-usage-guard.json')

type PageProps = { searchParams?: { message?: string; error?: string } }
type BuildRun = { pid?: number; phase?: string; status?: string; resumeAt?: string; message?: string }
type Ready = { ready?: boolean; createdAt?: string; categories?: Array<{ checks: Array<{ name: string; status: string; message: string }> }> }
type Phase = { id: string; status: string }
type Guard = { thresholdPercent?: number; learnedSessionTokenLimit?: number; resetAt?: string; notes?: string; updatedAt?: string }

function readJson<T>(file: string, fallback: T) {
  if (!fs.existsSync(file)) return fallback
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function isProcessAlive(pid?: number) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function currentPhase(phases: Phase[], run: BuildRun) {
  return run.phase || phases.find((phase) => phase.status !== 'done')?.id || 'P01'
}

function claudeAccount(ready: Ready) {
  return ready.categories?.flatMap((category) => category.checks).find((check) => check.name === 'Claude Code account')
}

export default function ClaudeSwitchPage({ searchParams }: PageProps) {
  const run = readJson<BuildRun>(buildRunFile, { status: 'idle' })
  const ready = readJson<Ready>(readyFile, { ready: false, categories: [] })
  const phases = readJson<Phase[]>(phasesFile, [])
  const guard = readJson<Guard>(guardFile, { thresholdPercent: 95 })
  const live = isProcessAlive(run.pid) && ['starting', 'running', 'paused'].includes(run.status ?? '')
  const phase = currentPhase(phases, run)
  const account = claudeAccount(ready)

  return (
    <section className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Claude Account Switch</h1>
          <p className="mt-2 text-sm text-slate-400">A safe sequence for changing Claude Code to Max without losing DevTools progress.</p>
        </div>
        <a href="/build-control" className="rounded-md border border-slate-700 px-3 py-2 text-sm text-sky-300 hover:bg-slate-800">Open Build Control</a>
      </div>

      {searchParams?.message && <p className="mt-3 text-sm text-emerald-300">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-3 text-sm text-red-300">{searchParams.error}</p>}

      <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Current build</div>
          <div className={live ? 'mt-2 text-lg font-semibold text-amber-300' : 'mt-2 text-lg font-semibold text-emerald-300'}>{live ? run.status ?? 'running' : 'stopped'}</div>
          <p className="mt-2 text-sm text-slate-400">{run.message ?? 'No active build process.'}</p>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Resume phase</div>
          <div className="mt-2 text-lg font-semibold">{phase}</div>
          <p className="mt-2 text-sm text-slate-400">DevTools will resume from this phase after the account switch.</p>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Claude account</div>
          <div className={account?.status === 'pass' ? 'mt-2 text-lg font-semibold text-emerald-300' : 'mt-2 text-lg font-semibold text-amber-300'}>{account?.status === 'pass' ? 'verified' : 'needs check'}</div>
          <p className="mt-2 text-sm text-slate-400">{account?.message ?? 'Run Ready Check after switching.'}</p>
        </div>
      </div>

      <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-5">
        <div className="mb-5 rounded-md border border-cyan-900/60 bg-cyan-950/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-cyan-100">Changed Claude account?</h2>
              <p className="mt-1 text-sm text-slate-300">Use this after signing into a different Claude plan. DevTools will stop the old watcher, reset the usage guard, and verify the new account.</p>
            </div>
            <form action="/api/actions" method="post">
              <input type="hidden" name="action" value="claude-switch-finalize" />
              <button className="rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white">I Changed Claude Account</button>
            </form>
          </div>
        </div>

        <h2 className="text-sm font-semibold">Switching Sequence</h2>
        <div className="mt-4 grid gap-3">
          <div className="rounded border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <strong>1. Pause the automation safely</strong>
                <p className="mt-1 text-sm text-slate-400">Stop the watcher before logging out or changing Claude accounts.</p>
              </div>
              <form action="/api/actions" method="post">
                <input type="hidden" name="action" value="phase-build-stop" />
                <button disabled={!live} className="rounded-md border border-red-800 px-3 py-2 text-sm text-red-200 hover:bg-red-950/50 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500">Stop Build</button>
              </form>
            </div>
          </div>

          <div className="rounded border border-slate-800 bg-slate-950/40 p-4">
            <strong>2. Switch Claude Code to Max</strong>
            <p className="mt-1 text-sm text-slate-400">Open Claude Code, sign out if needed, then sign in with the Max account. Keep DevTools open.</p>
          </div>

          <div className="rounded border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <strong>3. Reset the usage guard</strong>
                <p className="mt-1 text-sm text-slate-400">This clears the learned Pro limit so DevTools can learn the Max session limit.</p>
                <p className="mt-1 text-xs text-slate-500">Current guard: {guard.learnedSessionTokenLimit ? `${guard.learnedSessionTokenLimit.toLocaleString()} tokens` : 'not learned'} · threshold {guard.thresholdPercent ?? 95}%</p>
              </div>
              <form action="/api/actions" method="post">
                <input type="hidden" name="action" value="claude-switch-reset-guard" />
                <button className="rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">Reset Guard</button>
              </form>
            </div>
          </div>

          <div className="rounded border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <strong>4. Verify Claude is ready</strong>
                <p className="mt-1 text-sm text-slate-400">Ready Check confirms Claude Code can run with the new account.</p>
              </div>
              <form action="/api/actions" method="post">
                <input type="hidden" name="action" value="ready-run" />
                <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-950">Run Ready Check</button>
              </form>
            </div>
          </div>

          <div className="rounded border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <strong>5. Resume development</strong>
                <p className="mt-1 text-sm text-slate-400">Start automation from {phase}. Completed phases stay completed.</p>
              </div>
              <form action="/api/actions" method="post">
                <input type="hidden" name="action" value="phase-build-watch" />
                <input type="hidden" name="from" value={phase} />
                <button disabled={live || account?.status !== 'pass'} className="rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">Resume from {phase}</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
