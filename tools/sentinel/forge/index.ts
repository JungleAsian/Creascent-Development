import fs from 'node:fs'
import { logsDir, forgeHeartbeatFile } from '../lib/paths.js'
import { readJsonFile } from '../lib/json-store.js'
import { writeHeartbeat } from '../lib/heartbeat.js'
import { isProcessAlive } from '../lib/proc.js'
import { mergeIssuesForSource, writeIssues, type IssueDraft } from '../lib/issues.js'
import type { SubsystemDeps } from '../lib/deps.js'

const VERSION = '1.0.0'

/** Forge-specific agent routing (Forge spec → Agent Routing table). */
const ROUTING: Record<string, { agent: string; provider: string }> = {
  'claude-session': { agent: 'Claude Session agent', provider: 'Direct Call' },
  'dashboard-route-error': { agent: 'Dashboard/UI agent', provider: 'global' },
  'stale-heartbeat': { agent: 'Diagnostics agent', provider: 'Direct Call' },
  'dead-watcher-process': { agent: 'Diagnostics agent', provider: 'Direct Call' },
  'ready-check-blocker': { agent: 'Diagnostics agent', provider: 'Direct Call' },
  'gate-failure': { agent: 'CLI/Build agent', provider: 'global' },
  'git-failure': { agent: 'Git/GitHub agent', provider: 'global' },
  'notion-sync-failure': { agent: 'Notion Integration agent', provider: 'Direct Call' },
  'deployment-check-failure': { agent: 'Deployment agent', provider: 'global' },
  'stack-cve': { agent: 'CLI/Build agent', provider: 'global' },
  'missing-prompt': { agent: 'CLI/Build agent', provider: 'global' }
}

function route(category: string) {
  return ROUTING[category] ?? { agent: 'Manual queue', provider: 'manual' }
}

function readJson<T>(name: string, fallback: T): T {
  return readJsonFile<T>(`${logsDir}/${name}`, fallback)
}

function latestLog(pattern: RegExp): string | null {
  try {
    return (
      fs
        .readdirSync(logsDir)
        .filter((n) => pattern.test(n))
        .map((n) => ({ n, m: fs.statSync(`${logsDir}/${n}`).mtimeMs }))
        .sort((a, b) => b.m - a.m)[0]?.n ?? null
    )
  } catch {
    return null
  }
}

function tail(name: string | null, lines = 160): string[] {
  if (!name) return []
  try {
    return fs.readFileSync(`${logsDir}/${name}`, 'utf8').split(/\r?\n/).filter(Boolean).slice(-lines)
  } catch {
    return []
  }
}

type RunState = { pid?: number; phase?: string; status?: string; heartbeatAt?: string; message?: string }
type ReadyJson = { categories?: Array<{ checks?: Array<{ name?: string; status?: string; message?: string; fix?: string }> }> }
type GateJson = { results?: Array<{ name?: string; ok?: boolean; detail?: string }> }
type ControlRow = { phaseId?: string; status?: string; notes?: string; updatedAt?: string }
type StackJson = { cves?: Array<{ package?: string; id?: string; severity?: string }>; breaking?: Array<{ package?: string; note?: string }>; priceChanges?: Array<{ provider?: string; deltaPct?: number }> }
type UsageGuard = { usagePct?: number; percent?: number; paused?: boolean; resumeAt?: string; accountMismatch?: boolean }

function mk(
  category: string,
  severity: IssueDraft['severity'],
  diagnosis: string,
  evidence: string[],
  sourceSignals: string[],
  suggestedFix: string,
  opts: { phase?: string; risk?: IssueDraft['riskLevel']; requiresApproval?: boolean; phaseStatus?: string; claudeSessionPct?: number } = {}
): IssueDraft {
  const r = route(category)
  return {
    source: 'forge',
    environment: 'development',
    phase: opts.phase ?? 'build',
    buildPhase: opts.phase,
    phaseStatus: opts.phaseStatus,
    claudeSessionPct: opts.claudeSessionPct,
    severity,
    category,
    diagnosis,
    evidence,
    sourceSignals,
    suggestedFix,
    riskLevel: opts.risk ?? (severity === 'critical' ? 'high' : 'medium'),
    requiresApproval: opts.requiresApproval ?? false,
    assignedAgent: r.agent,
    assignedProvider: r.provider
  }
}

export class ForgeScanner {
  private deps: SubsystemDeps
  private timer: NodeJS.Timeout | null = null
  private startedAt = Date.now()
  private lastScanAt: string | null = null

  constructor(deps: SubsystemDeps) {
    this.deps = deps
  }

  start(intervalMs = 30_000) {
    this.scanOnce()
    this.timer = setInterval(() => this.scanOnce(), intervalMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  scanOnce(): IssueDraft[] {
    const drafts: IssueDraft[] = []
    this.detectBuild(drafts)
    this.detectClaudeSession(drafts)
    this.detectReady(drafts)
    this.detectGates(drafts)
    this.detectBuildControl(drafts)
    this.detectDeployment(drafts)
    this.detectStack(drafts)
    this.detectLogs(drafts)

    const merged = mergeIssuesForSource('forge', drafts)
    writeIssues(merged)
    this.lastScanAt = new Date().toISOString()
    this.writeHeartbeatNow(drafts.length)
    this.deps.reportAlive()
    return drafts
  }

  private writeHeartbeatNow(active: number) {
    writeHeartbeat(forgeHeartbeatFile, {
      timestamp: new Date().toISOString(),
      status: 'running',
      version: VERSION,
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      activeIssues: active
    })
  }

  private detectBuild(drafts: IssueDraft[]) {
    const run = readJson<RunState>('build-run.json', {})
    const phase = run.phase ?? 'unknown'
    const active = ['starting', 'running', 'paused'].includes(run.status ?? '')
    const ageMs = run.heartbeatAt ? Date.now() - new Date(run.heartbeatAt).getTime() : null
    if (active && !isProcessAlive(run.pid)) {
      drafts.push(mk('dead-watcher-process', 'critical', `Build watcher marked ${run.status} but PID ${run.pid ?? 'unknown'} is not alive.`, [`Message: ${run.message ?? 'none'}`, `Heartbeat: ${run.heartbeatAt ?? 'none'}`], ['logs/build-run.json'], 'Review Build Control; restart automation only after approval.', { phase, phaseStatus: run.status, risk: 'high', requiresApproval: true }))
    }
    if (active && typeof ageMs === 'number' && ageMs > 120_000) {
      drafts.push(mk('stale-heartbeat', ageMs > 300_000 ? 'critical' : 'warning', `Build heartbeat is stale by ${Math.round(ageMs / 1000)}s.`, [`Last heartbeat: ${run.heartbeatAt}`, `Status: ${run.status}`], ['logs/build-run.json'], 'Open Install Monitor and Diagnostics. Restart automation only after approval.', { phase, phaseStatus: run.status, risk: 'high', requiresApproval: false }))
    }
    if ((run.status ?? '') === 'failed') {
      drafts.push(mk('gate-failure', 'critical', `Build is marked failed at ${phase}.`, [run.message ?? 'No message.'], ['logs/build-run.json'], 'Route to CLI/Build agent; review failure before retry.', { phase, phaseStatus: 'failed', requiresApproval: true }))
    }
  }

  private detectClaudeSession(drafts: IssueDraft[]) {
    const guard = readJson<UsageGuard>('claude-usage-guard.json', {})
    const pct = guard.usagePct ?? guard.percent
    const run = readJson<RunState>('build-run.json', {})
    if (guard.accountMismatch) {
      drafts.push(mk('claude-session', 'critical', 'Claude Code account mismatch detected.', ['claude-usage-guard.json reports accountMismatch=true'], ['logs/claude-usage-guard.json'], 'Use Claude Switch to select the correct account.', { risk: 'high', requiresApproval: true }))
    }
    if (guard.paused) {
      drafts.push(mk('claude-session', 'critical', 'Build paused — Claude Code session limit hit.', [`Resume at: ${guard.resumeAt ?? 'unknown'}`], ['logs/claude-usage-guard.json'], 'Switch to Codex via Cortex or wait for the session reset.', { claudeSessionPct: pct, risk: 'high', requiresApproval: true }))
    } else if (typeof pct === 'number' && pct >= 80) {
      drafts.push(mk('claude-session', 'warning', `Claude Code session usage at ${pct}%.`, [`Usage: ${pct}%`], ['logs/claude-usage-guard.json'], 'Consider switching to Codex in Cortex until the session resets.', { claudeSessionPct: pct, risk: 'medium', requiresApproval: false }))
    }
    const msg = `${run.message ?? ''}`.toLowerCase()
    if (msg.includes('session limit') || msg.includes("you've hit your session limit")) {
      drafts.push(mk('claude-session', 'critical', run.message ?? 'Claude Code session limit detected.', [`Status: ${run.status}`], ['logs/build-run.json'], 'Use Claude Switch / Cortex, then resume after the reset window.', { risk: 'high', requiresApproval: true }))
    }
  }

  private detectReady(drafts: IssueDraft[]) {
    const ready = readJson<ReadyJson>('ready.json', {})
    for (const cat of ready.categories ?? []) {
      for (const check of cat.checks ?? []) {
        if (check.status !== 'critical' && check.status !== 'fail') continue
        const message = `${check.name ?? 'Ready check'}: ${check.message ?? 'blocker'}`
        const isClaude = message.toLowerCase().includes('claude') || message.toLowerCase().includes('session limit')
        drafts.push(mk(isClaude ? 'claude-session' : 'ready-check-blocker', isClaude ? 'critical' : 'warning', message, [check.fix ?? 'Run Ready Check for the exact blocker.'], ['logs/ready.json', 'pnpm tool ready'], check.fix ?? 'Resolve the listed blocker, then rerun the scan.', { phase: 'setup', requiresApproval: true }))
      }
    }
  }

  private detectGates(drafts: IssueDraft[]) {
    const gates = readJson<GateJson>('six-gates.json', {})
    for (const result of gates.results ?? []) {
      if (result.ok !== false) continue
      drafts.push(mk('gate-failure', 'warning', `${result.name ?? 'Gate'} failed.`, [result.detail?.slice(0, 800) ?? 'Gate reported failure.'], ['logs/six-gates.json', 'pnpm tool gates check'], 'Route to CLI/Build agent; do not auto-fix gate failures without approval.', { phase: 'quality-gates', requiresApproval: true }))
    }
  }

  private detectBuildControl(drafts: IssueDraft[]) {
    const rows = readJson<ControlRow[]>('build-control.json', [])
    for (const row of rows) {
      if (row.status !== 'failed') continue
      const notes = row.notes ?? ''
      const isGit = /git|commit|push/i.test(notes)
      drafts.push(mk(isGit ? 'git-failure' : 'gate-failure', 'critical', `${row.phaseId ?? 'Phase'} is failed in Build Control.`, [notes || 'Build Control row failed.', `Updated: ${row.updatedAt ?? 'unknown'}`], ['logs/build-control.json'], isGit ? 'Route to Git/GitHub agent; commit/push only after approval.' : 'Route to CLI/Build agent; verify phase status before changing it.', { phase: row.phaseId ?? 'unknown', phaseStatus: 'failed', requiresApproval: true }))
    }
  }

  private detectDeployment(drafts: IssueDraft[]) {
    const runs = readJson<Array<{ createdAt?: string; checks?: Array<{ name?: string; status?: string; message?: string }> }>>('post-deployment.json', [])
    const latest = runs[0]
    if (!latest) return
    for (const check of latest.checks ?? []) {
      if (check.status !== 'fail') continue
      drafts.push(mk('deployment-check-failure', 'critical', `${check.name ?? 'Deployment check'} failed: ${check.message ?? 'no detail'}`, [`Latest run: ${latest.createdAt ?? 'unknown'}`], ['logs/post-deployment.json'], 'Route to Deployment agent; rerun the functionality check after a fix.', { phase: 'post-deployment', risk: 'medium', requiresApproval: true }))
    }
  }

  private detectStack(drafts: IssueDraft[]) {
    const stack = readJson<StackJson>('stack-intelligence.json', {})
    for (const cve of stack.cves ?? []) {
      drafts.push(mk('stack-cve', 'critical', `CVE ${cve.id ?? ''} affects ${cve.package ?? 'a dependency'}.`, [`Severity: ${cve.severity ?? 'unknown'}`], ['logs/stack-intelligence.json'], 'Route to CLI/Build agent to patch or pin the affected dependency.', { phase: 'stack', requiresApproval: true }))
    }
    for (const b of stack.breaking ?? []) {
      drafts.push(mk('stack-cve', 'warning', `Breaking change in ${b.package ?? 'a dependency'}.`, [b.note ?? 'Breaking change reported.'], ['logs/stack-intelligence.json'], 'Review the breaking change before upgrading.', { phase: 'stack', requiresApproval: false }))
    }
    for (const p of stack.priceChanges ?? []) {
      if ((p.deltaPct ?? 0) > 10) {
        drafts.push(mk('stack-cve', 'info', `${p.provider ?? 'AI provider'} price up ${p.deltaPct}%.`, [`Delta: ${p.deltaPct}%`], ['logs/stack-intelligence.json'], 'Informational — review provider mix in Cortex.', { phase: 'stack', risk: 'low', requiresApproval: false }))
      }
    }
  }

  private detectLogs(drafts: IssueDraft[]) {
    const combined = [...tail(latestLog(/^phase-\d{4}-\d{2}-\d{2}\.log$/)), ...tail(latestLog(/^dashboard-.*\.(out|err)\.log$/))].slice(-200)
    const lower = combined.join('\n').toLowerCase()
    if ((lower.includes('cannot find module') && lower.includes('chunks')) || lower.includes('chunkloaderror') || lower.includes('failed to load chunk')) {
      drafts.push(mk('dashboard-route-error', 'warning', 'Dashboard build/cache chunk error detected in recent logs.', combined.filter((l) => /chunk|\.next|error/i.test(l)).slice(-4), ['logs/dashboard-*.log'], 'Healer can clear .next after stopping the dashboard, then restart.', { phase: 'dashboard', risk: 'low', requiresApproval: false }))
    }
    if (combined.some((l) => /notion|sync/i.test(l) && /(failed|unauthorized|invalid)/i.test(l))) {
      drafts.push(mk('notion-sync-failure', 'warning', 'Possible Notion sync failure in recent logs.', combined.filter((l) => /notion|sync/i.test(l)).slice(-4), ['logs/*.log'], 'Route to Notion Integration agent; verify Notion settings.', { phase: 'notion', risk: 'medium', requiresApproval: false }))
    }
  }

  status() {
    return { version: VERSION, uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000), lastScanAt: this.lastScanAt }
  }
}
