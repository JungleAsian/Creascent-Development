import fs from 'node:fs'
import path from 'node:path'
import { toolsRoot } from '../lib/paths.js'
import { httpProbe } from '../lib/net.js'
import { findPidsOnPort, killPid, spawnDetached } from '../lib/proc.js'
import { HEALER_PERMISSIONS, isActionAllowed } from '../executor/permissions.js'
import type { SentinelConfig } from '../config/schema.js'
import type { IssueDraft, SentinelSeverity } from '../lib/issues.js'

export interface HealerDeps {
  getConfig(): SentinelConfig
  audit(entry: { subsystem: 'healer'; action: string; outcome: 'success' | 'failed' | 'escalated' | 'info'; message: string; durationMs?: number }): void
  notifyAlert(severity: SentinelSeverity, title: string, message: string): void
  notifyActivity(title: string, message: string): void
  push(severity: SentinelSeverity, title: string, message: string): void
  recomputeTray(): void
  resolveHeartbeatTarget(targetId: string, message: string): void
  escalateIssue(draft: IssueDraft): void
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function portFromUrl(url: string, fallback: number) {
  try {
    const p = new URL(url).port
    return p ? Number(p) : fallback
  } catch {
    return fallback
  }
}

export class DevToolsHealer {
  private deps: HealerDeps
  private restartTimestamps: number[] = []
  private lockedUntil = 0
  private healing = false

  constructor(deps: HealerDeps) {
    this.deps = deps
  }

  /** Beacon calls this when the DevTools dashboard target goes stale. */
  async heal(targetId: string) {
    if (targetId !== 'devtools-dashboard') return // only the dashboard is auto-recovered
    const cfg = this.deps.getConfig()
    if (!cfg.healer.enabled) return
    if (this.healing) return
    const now = Date.now()
    if (now < this.lockedUntil) return // cooldown / locked

    // Rate limit
    this.restartTimestamps = this.restartTimestamps.filter((t) => now - t < 60 * 60 * 1000)
    if (this.restartTimestamps.length >= cfg.healer.maxRestartsPerHour) {
      this.lockAndEscalate('Rate limit reached — maxRestartsPerHour exceeded.')
      return
    }

    this.healing = true
    this.deps.recomputeTray()
    const start = Date.now()
    const healthUrl = cfg.targets.devtoolsHealthUrl
    const port = portFromUrl(healthUrl, 4000)

    try {
      for (let attempt = 1; attempt <= cfg.healer.escalateAfterAttempts; attempt += 1) {
        this.restartTimestamps.push(Date.now())
        await this.runAttempt(attempt, port)
        const recovered = await this.verifyHealth(healthUrl, 60_000)
        if (recovered) {
          const downtime = Math.round((Date.now() - start) / 1000)
          this.deps.audit({ subsystem: 'healer', action: `recovery.attempt-${attempt}`, outcome: 'success', message: `DevTools restored after attempt ${attempt}`, durationMs: Date.now() - start })
          this.deps.resolveHeartbeatTarget('devtools-dashboard', `DevTools restored — downtime ${downtime}s`)
          this.deps.notifyActivity('DevTools restored', `DevTools dashboard recovered after attempt ${attempt} — downtime ${downtime}s.`)
          this.deps.recomputeTray()
          return
        }
      }
      this.lockAndEscalate(`DevTools unrecoverable after ${cfg.healer.escalateAfterAttempts} attempts.`)
    } finally {
      this.healing = false
    }
  }

  private async runAttempt(attempt: number, port: number) {
    if (attempt === 1) {
      // Restart dashboard process.
      this.act('kill-dashboard-process', () => this.killDashboard(port))
      await sleep(1500)
      this.act('restart-dashboard-process', () => this.restartDashboard())
    } else if (attempt === 2) {
      // Clear .next cache + restart.
      this.act('kill-dashboard-process', () => this.killDashboard(port))
      this.act('clear-next-cache', () => this.clearNextCache())
      await sleep(1500)
      this.act('restart-dashboard-process', () => this.restartDashboard())
    } else {
      // Kill port conflict + restart.
      this.act('kill-port-conflict', () => this.killDashboard(port))
      await sleep(1500)
      this.act('restart-dashboard-process', () => this.restartDashboard())
    }
  }

  /** Run an action only if the permission envelope allows it. */
  private act(action: string, fn: () => void) {
    if (!isActionAllowed(HEALER_PERMISSIONS, action)) {
      this.deps.audit({ subsystem: 'healer', action, outcome: 'failed', message: `Action ${action} denied by permission envelope` })
      return
    }
    try {
      fn()
      this.deps.audit({ subsystem: 'healer', action, outcome: 'info', message: `Executed ${action}` })
    } catch (err) {
      this.deps.audit({ subsystem: 'healer', action, outcome: 'failed', message: `Action ${action} threw: ${(err as Error).message}` })
    }
  }

  private killDashboard(port: number) {
    for (const pid of findPidsOnPort(port)) killPid(pid, true)
  }

  private clearNextCache() {
    const next = path.join(toolsRoot, 'dashboard', '.next')
    if (fs.existsSync(next)) fs.rmSync(next, { recursive: true, force: true })
  }

  private restartDashboard() {
    // Mirrors `pnpm --dir dashboard dev` from tools/package.json.
    spawnDetached('pnpm', ['--dir', 'dashboard', 'dev'], { cwd: toolsRoot })
  }

  private async verifyHealth(url: string, withinMs: number) {
    const deadline = Date.now() + withinMs
    while (Date.now() < deadline) {
      const r = await httpProbe(url, { expectStatuses: [200], timeoutMs: 4000 })
      if (r.ok) return true
      await sleep(3000)
    }
    return false
  }

  private lockAndEscalate(reason: string) {
    const cfg = this.deps.getConfig()
    this.lockedUntil = Date.now() + cfg.healer.cooldownSeconds * 1000
    this.deps.audit({ subsystem: 'healer', action: 'escalate', outcome: 'escalated', message: reason })
    this.deps.escalateIssue({
      source: 'devtools-healer',
      environment: 'development',
      phase: 'dashboard',
      severity: 'critical',
      category: 'devtools-unrecoverable',
      checkName: 'devtools-dashboard',
      diagnosis: 'DevTools dashboard could not be recovered automatically.',
      evidence: [reason, `Cooldown until ${new Date(this.lockedUntil).toISOString()}`],
      sourceSignals: ['healer'],
      suggestedFix: 'Manual intervention required. Check dashboard logs and port 4000.',
      riskLevel: 'high',
      requiresApproval: true,
      assignedAgent: 'Dashboard/UI agent',
      assignedProvider: 'global'
    })
    this.deps.notifyAlert('critical', 'DevTools unrecoverable', `${reason} Manual intervention required.`)
    this.deps.push('critical', 'DevTools unrecoverable', 'Manual intervention required.')
    this.deps.recomputeTray()
  }

  isHealing() {
    return this.healing
  }
}
