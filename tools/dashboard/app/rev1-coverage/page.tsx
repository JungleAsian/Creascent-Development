import fs from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import { BuildProgressGauge } from '../build-progress-gauge'

const toolsRoot = path.resolve(process.cwd(), '..')
const coverageFile = path.join(toolsRoot, 'logs', 'rev1-feature-coverage.json')
const featureRunFile = path.join(toolsRoot, 'logs', 'feature-run.json')
const readyFile = path.join(toolsRoot, 'logs', 'ready.json')
const startReadinessFile = path.join(toolsRoot, 'logs', 'start-readiness.json')
const postDeploymentFile = path.join(toolsRoot, 'logs', 'post-deployment.json')

type FeatureStatus = 'complete' | 'partial' | 'missing'
type Feature = {
  id: number
  phase: string
  area: string
  feature: string
  status: FeatureStatus
  priority: 'critical' | 'high' | 'medium' | 'low'
  evidence: string
  nextStep: string
}
type PageProps = { searchParams?: { message?: string; error?: string } }
type BuildRun = {
  pid?: number
  phase?: string
  workflow?: string
  status?: string
  message?: string
  heartbeatAt?: string
  githubStatus?: string
  githubMessage?: string
  githubBranch?: string
  lastCommitHash?: string
  pushedAt?: string
}
type Ready = { ready?: boolean; summary?: { critical?: number; warning?: number; pass?: number }; createdAt?: string }
type StartReadiness = { ready?: boolean; phase?: string; createdAt?: string; steps?: Array<{ name: string; status: 'pass' | 'fail'; message: string }> }
type PostDeploymentRun = { target?: 'local' | 'vps'; createdAt?: string; summary?: { pass?: number; warning?: number; fail?: number } }

function readJson<T>(file: string, fallback: T) {
  if (!fs.existsSync(file)) return fallback
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function readFeatures() {
  return readJson<Feature[]>(coverageFile, [])
}

function statusTone(status: FeatureStatus) {
  if (status === 'complete') return 'border-emerald-700 bg-emerald-950/30 text-emerald-200'
  if (status === 'partial') return 'border-amber-700 bg-amber-950/30 text-amber-200'
  return 'border-red-700 bg-red-950/30 text-red-200'
}

function priorityTone(priority: Feature['priority']) {
  if (priority === 'critical') return 'border-red-700 bg-red-950/40 text-red-100'
  if (priority === 'high') return 'border-orange-700 bg-orange-950/30 text-orange-100'
  if (priority === 'medium') return 'border-amber-700 bg-amber-950/30 text-amber-100'
  return 'border-slate-700 bg-slate-800 text-slate-200'
}

function featurePercent(status: FeatureStatus) {
  if (status === 'complete') return 100
  if (status === 'partial') return 50
  return 0
}

function featureGaugeState(item: Feature, run: BuildRun, live: boolean): 'progressing' | 'halted' | 'stopped' | 'complete' {
  if (item.status === 'complete') return 'complete'
  if (run.workflow === 'features-development' && live && run.phase === item.phase) return 'progressing'
  if (item.status === 'partial') return 'halted'
  return 'stopped'
}

function featureGaugeLabel(item: Feature, run: BuildRun, live: boolean) {
  if (item.status === 'complete') return 'Complete'
  if (run.workflow === 'features-development' && live && run.phase === item.phase) return 'Developing'
  if (item.status === 'partial') return 'Partial'
  return 'Not started'
}

function overallFeaturePercent(features: Feature[]) {
  if (features.length === 0) return 0
  const total = features.reduce((sum, item) => sum + featurePercent(item.status), 0)
  return Math.round(total / features.length)
}

function countBy<T extends string>(rows: Feature[], read: (row: Feature) => T) {
  return rows.reduce<Record<T, number>>((acc, row) => {
    const key = read(row)
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {} as Record<T, number>)
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

function currentPhase(openItems: Feature[], run: BuildRun) {
  if (run.workflow === 'features-development' && ['starting', 'running', 'paused'].includes(run.status ?? '') && run.phase) return run.phase
  return openItems[0]?.phase || 'Phase 1'
}

function heartbeatAge(heartbeatAt?: string) {
  if (!heartbeatAt) return null
  const ageMs = Date.now() - new Date(heartbeatAt).getTime()
  if (!Number.isFinite(ageMs) || ageMs < 0) return null
  if (ageMs < 60000) return `${Math.max(1, Math.round(ageMs / 1000))}s ago`
  return `${Math.round(ageMs / 60000)}m ago`
}

function heartbeatState(run: BuildRun, live: boolean) {
  if (run.status === 'paused') return 'paused'
  if (!live && ['starting', 'running'].includes(run.status ?? '')) return 'dead'
  if (!live) return 'stopped'
  if (!run.heartbeatAt) return 'checking'

  const ageMs = Date.now() - new Date(run.heartbeatAt).getTime()
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'checking'
  if (ageMs <= 60000) return 'normal'
  if (ageMs <= 120000) return 'delayed'
  return 'lost'
}

function heartbeatTone(state: string) {
  if (state === 'normal') return 'border-emerald-800 bg-emerald-950/30 text-emerald-100'
  if (state === 'paused' || state === 'delayed' || state === 'checking') return 'border-amber-800 bg-amber-950/30 text-amber-100'
  if (state === 'lost' || state === 'dead') return 'border-red-800 bg-red-950/30 text-red-100'
  return 'border-slate-800 bg-slate-950/40 text-slate-200'
}

function heartbeatLabel(state: string) {
  if (state === 'normal') return 'live'
  if (state === 'paused') return 'paused'
  if (state === 'delayed') return 'delayed'
  if (state === 'lost') return 'heartbeat lost'
  if (state === 'dead') return 'process stopped'
  if (state === 'checking') return 'checking'
  return 'not running'
}

function githubSyncTone(status?: string) {
  if (status === 'pushed') return 'border-emerald-800 bg-emerald-950/30 text-emerald-100'
  if (status === 'pending') return 'border-amber-800 bg-amber-950/30 text-amber-100'
  if (status === 'failed') return 'border-red-800 bg-red-950/30 text-red-100'
  if (status === 'skipped') return 'border-slate-700 bg-slate-900 text-slate-200'
  return 'border-slate-800 bg-slate-950/40 text-slate-200'
}

function githubSyncLabel(status?: string) {
  if (status === 'pushed') return 'pushed'
  if (status === 'pending') return 'pushing'
  if (status === 'failed') return 'push failed'
  if (status === 'skipped') return 'no new commit'
  return 'not synced yet'
}

function formatDateTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleString()
}

function localCheckPassed() {
  const runs = readJson<PostDeploymentRun[]>(postDeploymentFile, [])
  const latestLocal = runs.find((run) => (run.target ?? 'local') === 'local')
  return Boolean(latestLocal && (latestLocal.summary?.fail ?? 1) === 0)
}

export default function FeaturesDevelopmentPage({ searchParams }: PageProps) {
  const features = readFeatures().sort((a, b) => {
    const phaseOrder = a.phase.localeCompare(b.phase)
    if (phaseOrder !== 0) return phaseOrder
    return a.id - b.id
  })
  const statusCounts = countBy(features, (row) => row.status)
  const phaseCounts = countBy(features.filter((row) => row.status !== 'complete'), (row) => row.phase)
  const priorityOrder: Record<Feature['priority'], number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const nextClaudeQueue = features
    .filter((row) => row.status !== 'complete')
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || a.phase.localeCompare(b.phase) || a.id - b.id)
    .slice(0, 12)
  const openQueue = features
    .filter((row) => row.status !== 'complete')
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || a.phase.localeCompare(b.phase) || a.id - b.id)
  const run = readJson<BuildRun>(featureRunFile, { status: 'idle', workflow: 'features-development' })
  const ready = readJson<Ready>(readyFile, { ready: false, summary: { critical: 1, warning: 0, pass: 0 } })
  const startReadiness = readJson<StartReadiness>(startReadinessFile, { ready: false, steps: [] })
  const live = isProcessAlive(run.pid) && ['starting', 'running', 'paused'].includes(run.status ?? '')
  const nextPhase = currentPhase(openQueue, run)
  const startCheckPassed = Boolean(startReadiness.ready && startReadiness.phase === nextPhase)
  const readyCritical = ready.summary?.critical ?? 1
  const allFeaturesComplete = features.length > 0 && openQueue.length === 0
  const localPassed = localCheckPassed()
  const featureWorkflowActive = run.workflow === 'features-development'
  const featureHeartbeatState = heartbeatState(run, live)
  const featureHeartbeatAge = heartbeatAge(run.heartbeatAt)
  const missing = statusCounts.missing ?? 0
  const partial = statusCounts.partial ?? 0
  const complete = statusCounts.complete ?? 0
  const overallPercent = overallFeaturePercent(features)
  const overallGaugeState = allFeaturesComplete ? 'complete' : live && featureWorkflowActive ? 'progressing' : partial > 0 ? 'halted' : 'stopped'

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Features Development</h1>
          <p className="mt-2 text-sm text-slate-400">
            Docmee feature development coverage from the 41-feature design. Use this as Claude&apos;s continuation queue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action="/api/actions" method="post">
            <input type="hidden" name="action" value="start-readiness" />
            <input type="hidden" name="phase" value={nextPhase} />
            <input type="hidden" name="workflow" value="features-development" />
            <button className="min-h-11 rounded-md border border-cyan-700 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-950/40">Run Start Check</button>
          </form>
          <form action="/api/actions" method="post">
            <input type="hidden" name="action" value="phase-build-watch" />
            <input type="hidden" name="from" value={nextPhase} />
            <input type="hidden" name="workflow" value="features-development" />
            <button disabled={!startCheckPassed || live || allFeaturesComplete} className="min-h-11 rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">Start Feature Automation</button>
          </form>
        </div>
      </div>

      {searchParams?.message && <p className="mt-3 rounded-md border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-200">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-3 rounded-md border border-red-800 bg-red-950/30 p-3 text-sm text-red-200">{searchParams.error}</p>}

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Features</p>
          <p className="mt-2 text-3xl font-semibold">{features.length}</p>
        </div>
        <div className="rounded-md border border-red-900 bg-red-950/20 p-4">
          <p className="text-xs text-red-200/70">Missing</p>
          <p className="mt-2 text-3xl font-semibold text-red-200">{missing}</p>
        </div>
        <div className="rounded-md border border-amber-900 bg-amber-950/20 p-4">
          <p className="text-xs text-amber-200/70">Partial</p>
          <p className="mt-2 text-3xl font-semibold text-amber-200">{partial}</p>
        </div>
        <div className="rounded-md border border-emerald-900 bg-emerald-950/20 p-4">
          <p className="text-xs text-emerald-200/70">Complete</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-200">{complete}</p>
        </div>
      </div>

      <div className="mt-5 rounded-md border border-cyan-800 bg-cyan-950/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-cyan-100">Feature Automation Control</h2>
            <p className="mt-2 text-sm leading-6 text-cyan-100/80">
              Run the start check, launch automated development for the open feature queue, check the app locally, then continue to VPS deployment.
            </p>
          </div>
          <BuildProgressGauge
            size="md"
            percent={overallPercent}
            state={overallGaugeState}
            label="Feature progress"
            message={`${complete}/${features.length} complete, ${partial} partial, ${missing} missing`}
          />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <div className={readyCritical > 0 ? 'rounded border border-red-800 bg-red-950/30 p-3' : 'rounded border border-emerald-800 bg-emerald-950/30 p-3'}>
            <p className="text-xs text-slate-400">Ready Check</p>
            <p className={readyCritical > 0 ? 'mt-1 text-sm font-semibold text-red-200' : 'mt-1 text-sm font-semibold text-emerald-200'}>{readyCritical > 0 ? `${readyCritical} blocker(s)` : 'Ready'}</p>
          </div>
          <div className={startCheckPassed ? 'rounded border border-emerald-800 bg-emerald-950/30 p-3' : 'rounded border border-amber-800 bg-amber-950/30 p-3'}>
            <p className="text-xs text-slate-400">Start Check</p>
            <p className={startCheckPassed ? 'mt-1 text-sm font-semibold text-emerald-200' : 'mt-1 text-sm font-semibold text-amber-200'}>{startCheckPassed ? `Passed for ${nextPhase}` : `Needed for ${nextPhase}`}</p>
          </div>
          <div className={live ? 'rounded border border-amber-800 bg-amber-950/30 p-3' : 'rounded border border-slate-800 bg-slate-950/40 p-3'}>
            <p className="text-xs text-slate-400">Automation</p>
            <p className={live ? 'mt-1 text-sm font-semibold text-amber-200' : 'mt-1 text-sm font-semibold text-slate-200'}>{live ? run.status ?? 'running' : 'not running'}</p>
          </div>
          <Link href="/install-monitor" className={`rounded border p-3 ${heartbeatTone(featureHeartbeatState)}`}>
            <p className="text-xs opacity-75">Heartbeat</p>
            <p className="mt-1 text-sm font-semibold">{heartbeatLabel(featureHeartbeatState)}</p>
            <p className="mt-1 text-xs opacity-75">
              {featureWorkflowActive ? 'Features Development' : run.workflow ? 'Shared watcher' : 'No feature run'}
              {featureHeartbeatAge ? ` · ${featureHeartbeatAge}` : ''}
            </p>
          </Link>
          <div className={localPassed ? 'rounded border border-emerald-800 bg-emerald-950/30 p-3' : 'rounded border border-slate-800 bg-slate-950/40 p-3'}>
            <p className="text-xs text-slate-400">Local app check</p>
            <p className={localPassed ? 'mt-1 text-sm font-semibold text-emerald-200' : 'mt-1 text-sm font-semibold text-slate-200'}>{localPassed ? 'passed' : 'not passed yet'}</p>
          </div>
          <div className={`rounded border p-3 ${githubSyncTone(run.githubStatus)}`}>
            <p className="text-xs opacity-75">GitHub Sync</p>
            <p className="mt-1 text-sm font-semibold">{githubSyncLabel(run.githubStatus)}</p>
            <p className="mt-1 truncate text-xs opacity-75">
              {run.lastCommitHash ? `${run.githubBranch ?? 'branch'} · ${run.lastCommitHash}` : run.githubMessage ?? 'Waiting for first feature commit'}
            </p>
          </div>
          <div className={allFeaturesComplete && localPassed ? 'rounded border border-emerald-800 bg-emerald-950/30 p-3' : 'rounded border border-slate-800 bg-slate-950/40 p-3'}>
            <p className="text-xs text-slate-400">VPS deploy</p>
            <p className={allFeaturesComplete && localPassed ? 'mt-1 text-sm font-semibold text-emerald-200' : 'mt-1 text-sm font-semibold text-slate-200'}>{allFeaturesComplete && localPassed ? 'ready' : 'locked'}</p>
          </div>
        </div>
        {(run.githubMessage || run.pushedAt) && (
          <div className={`mt-3 rounded border p-3 text-sm ${githubSyncTone(run.githubStatus)}`}>
            <p className="font-semibold">GitHub Sync Details</p>
            <p className="mt-1 text-xs opacity-80">{run.githubMessage}</p>
            {run.pushedAt && <p className="mt-1 text-xs opacity-70">Last pushed: {formatDateTime(run.pushedAt)}</p>}
          </div>
        )}
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <form action="/api/actions" method="post" className="rounded border border-slate-800 bg-slate-950/40 p-3">
            <input type="hidden" name="action" value="start-readiness" />
            <input type="hidden" name="phase" value={nextPhase} />
            <input type="hidden" name="workflow" value="features-development" />
            <button className="w-full min-h-11 rounded-md border border-cyan-700 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-950/40">Run Start Check</button>
            <p className="mt-2 text-xs text-slate-500">Prepares context and dry-runs automation from {nextPhase}.</p>
          </form>
          <form action="/api/actions" method="post" className="rounded border border-slate-800 bg-slate-950/40 p-3">
            <input type="hidden" name="action" value="phase-build-watch" />
            <input type="hidden" name="from" value={nextPhase} />
            <input type="hidden" name="workflow" value="features-development" />
            <button disabled={!startCheckPassed || live || allFeaturesComplete} className="w-full min-h-11 rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">Start All Open Features</button>
            <p className="mt-2 text-xs text-slate-500">{allFeaturesComplete ? 'All features are already complete.' : `Starts the watcher from ${nextPhase} and connects it to the heartbeat.`}</p>
          </form>
          <form action="/api/actions" method="post" className="rounded border border-slate-800 bg-slate-950/40 p-3">
            <input type="hidden" name="action" value="app-launch" />
            <button disabled={!allFeaturesComplete} className="w-full min-h-11 rounded-md border border-emerald-700 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-950/40 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500">Launch App Locally</button>
            <p className="mt-2 text-xs text-slate-500">Opens the local app and posts access details to Discord.</p>
          </form>
          <Link
            href="/deploy"
            aria-disabled={!(allFeaturesComplete && localPassed)}
            className={allFeaturesComplete && localPassed
              ? 'rounded border border-emerald-700 bg-emerald-950/20 p-3 text-center text-sm text-emerald-100 hover:bg-emerald-950/40'
              : 'pointer-events-none rounded border border-slate-800 bg-slate-950/40 p-3 text-center text-sm text-slate-500'}
          >
            <span className="block min-h-11 py-2 font-medium">Deploy to VPS</span>
            <span className="block text-xs">{allFeaturesComplete && localPassed ? 'Open deployment guide.' : 'Complete features and local checks first.'}</span>
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Claude Next Work Queue</h2>
              <p className="mt-1 text-xs text-slate-400">Sorted by criticality. Build these before claiming feature development complete.</p>
            </div>
            <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">{nextClaudeQueue.length} shown</span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {nextClaudeQueue.map((item) => (
              <article key={item.id} className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">Req {item.id} · {item.phase} · {item.area}</p>
                    <h3 className="mt-1 text-sm font-semibold text-slate-100">{item.feature}</h3>
                  </div>
                  <div className="flex items-start gap-2">
                    <BuildProgressGauge
                      size="sm"
                      showLabel={false}
                      percent={featurePercent(item.status)}
                      state={featureGaugeState(item, run, live)}
                      centerText={`${featurePercent(item.status)}%`}
                    />
                    <div className="flex flex-col gap-1">
                      <span className={`rounded border px-2 py-1 text-xs ${statusTone(item.status)}`}>{item.status}</span>
                      <span className={`rounded border px-2 py-1 text-xs ${priorityTone(item.priority)}`}>{item.priority}</span>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-400">{item.evidence}</p>
                <p className="mt-3 rounded border border-cyan-900/70 bg-cyan-950/20 p-2 text-xs leading-5 text-cyan-100">
                  Next: {item.nextStep}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold">Open by Phase</h2>
            <div className="mt-3 space-y-2">
              {Object.entries(phaseCounts).map(([phase, count]) => (
                <div key={phase} className="flex items-center justify-between rounded border border-slate-800 px-3 py-2 text-sm">
                  <span>{phase}</span>
                  <span className="rounded bg-slate-800 px-2 py-1 text-xs">{count} open</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-red-900/70 bg-red-950/20 p-4">
            <h2 className="text-sm font-semibold text-red-100">Completion Rule</h2>
            <p className="mt-2 text-sm leading-6 text-red-100/80">
              Do not mark feature development complete until every feature is complete and the 8-step acceptance test passes on the VPS.
            </p>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold">Source</h2>
            <p className="mt-2 break-all text-xs leading-5 text-slate-400">
              tools/logs/rev1-feature-coverage.json
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-300">
            <tr>
              <th className="p-3">Req</th>
              <th className="p-3">Phase</th>
              <th className="p-3">Area</th>
              <th className="p-3">Feature</th>
              <th className="p-3">Progress</th>
              <th className="p-3">Status</th>
              <th className="p-3">Priority</th>
              <th className="p-3">Next Step</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {features.map((item) => (
              <tr key={item.id} className="bg-slate-950/60 align-top">
                <td className="p-3 font-mono text-xs text-slate-400">{item.id}</td>
                <td className="p-3 whitespace-nowrap">{item.phase}</td>
                <td className="p-3">{item.area}</td>
                <td className="p-3 font-medium text-slate-100">{item.feature}</td>
                <td className="p-3">
                  <BuildProgressGauge
                    size="sm"
                    showLabel
                    percent={featurePercent(item.status)}
                    state={featureGaugeState(item, run, live)}
                    label={featureGaugeLabel(item, run, live)}
                    message={`${featurePercent(item.status)}% feature progress`}
                    centerText={`${featurePercent(item.status)}%`}
                  />
                </td>
                <td className="p-3"><span className={`rounded border px-2 py-1 text-xs ${statusTone(item.status)}`}>{item.status}</span></td>
                <td className="p-3"><span className={`rounded border px-2 py-1 text-xs ${priorityTone(item.priority)}`}>{item.priority}</span></td>
                <td className="p-3 min-w-[320px] text-xs leading-5 text-slate-300">{item.nextStep}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
