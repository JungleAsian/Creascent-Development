import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { Command } from 'commander'
import { claudeCodeCommand, claudeCodeEnvironment } from '../lib/claude-code.js'
import { log } from '../lib/logger.js'
import { logsDir, promptsDir, toolsRoot } from '../lib/paths.js'
import { closeDiscordClient, sendNotification } from '../../../discord/src/bot.js'

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
type FeatureRunStatus = 'idle' | 'starting' | 'running' | 'paused' | 'stopped' | 'failed' | 'complete'
type GitHubSyncStatus = 'idle' | 'pending' | 'pushed' | 'failed' | 'skipped'
type ClaudeSessionResult = {
  code: number
  output: string
}

const coverageFile = path.join(logsDir, 'rev1-feature-coverage.json')
const featureRunFile = path.join(logsDir, 'feature-run.json')
const claudeLimitResumeBufferMs = 2 * 60 * 1000

function repoRoot() {
  return path.resolve(toolsRoot, '..')
}

function readFeatures() {
  if (!fs.existsSync(coverageFile)) return []
  return JSON.parse(fs.readFileSync(coverageFile, 'utf8')) as Feature[]
}

function touchFeatureRun(partial: {
  pid?: number
  phase?: string
  workflow?: string
  status?: FeatureRunStatus
  githubStatus?: GitHubSyncStatus
  githubMessage?: string
  githubBranch?: string
  lastCommitHash?: string
  pushedAt?: string
  startedAt?: string
  heartbeatAt?: string
  resumeAt?: string
  message?: string
}) {
  let current = {}
  if (fs.existsSync(featureRunFile)) {
    try {
      current = JSON.parse(fs.readFileSync(featureRunFile, 'utf8')) as Record<string, unknown>
    } catch {
      current = {}
    }
  }
  fs.mkdirSync(logsDir, { recursive: true })
  fs.writeFileSync(featureRunFile, `${JSON.stringify({
    ...current,
    ...partial,
    pid: partial.pid ?? process.pid,
    workflow: 'features-development',
    heartbeatAt: new Date().toISOString()
  }, null, 2)}\n`)
}

function runGit(args: string[]) {
  const result = spawnSync('git', args, {
    cwd: repoRoot(),
    encoding: 'utf8',
    shell: false,
    stdio: 'pipe',
    windowsHide: true
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return { ok: result.status === 0, output }
}

function gitValue(args: string[], fallback = '') {
  const result = runGit(args)
  if (!result.ok) return fallback
  return result.output.split(/\r?\n/).at(-1)?.trim() || fallback
}

function currentHead() {
  return gitValue(['rev-parse', '--short', 'HEAD'])
}

function currentBranch() {
  return gitValue(['branch', '--show-current'], 'unknown')
}

async function pushFeatureCommits(beforeHead: string, feature: Feature) {
  const afterHead = currentHead()
  const branch = currentBranch()

  if (!afterHead || afterHead === beforeHead) {
    const message = 'No new commit created in this feature session.'
    touchFeatureRun({
      phase: feature.phase,
      workflow: 'features-development',
      githubStatus: 'skipped',
      githubMessage: message,
      githubBranch: branch,
      lastCommitHash: afterHead
    })
    return { ok: true, status: 'skipped' as GitHubSyncStatus, message, branch, commit: afterHead }
  }

  touchFeatureRun({
    phase: feature.phase,
    workflow: 'features-development',
    githubStatus: 'pending',
    githubMessage: 'Pushing completed feature commit to GitHub.',
    githubBranch: branch,
    lastCommitHash: afterHead
  })

  const pushArgs = branch && branch !== 'unknown' ? ['push', 'origin', branch] : ['push']
  const pushResult = runGit(pushArgs)
  if (!pushResult.ok) {
    const message = pushResult.output || 'GitHub push failed.'
    touchFeatureRun({
      phase: feature.phase,
      workflow: 'features-development',
      status: 'failed',
      githubStatus: 'failed',
      githubMessage: message,
      githubBranch: branch,
      lastCommitHash: afterHead
    })
    await sendNotification(`Feature development GitHub push failed after Req ${feature.id} - ${feature.feature}. ${message}`, 'critical')
    return { ok: false, status: 'failed' as GitHubSyncStatus, message, branch, commit: afterHead }
  }

  const message = `Pushed feature commit ${afterHead} to GitHub branch ${branch}.`
  touchFeatureRun({
    phase: feature.phase,
    workflow: 'features-development',
    githubStatus: 'pushed',
    githubMessage: message,
    githubBranch: branch,
    lastCommitHash: afterHead,
    pushedAt: new Date().toISOString()
  })
  return { ok: true, status: 'pushed' as GitHubSyncStatus, message, branch, commit: afterHead }
}

function priorityRank(priority: Feature['priority']) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[priority]
}

function openFeatures() {
  return readFeatures()
    .filter((item) => item.status !== 'complete')
    .sort((left, right) => {
      return priorityRank(left.priority) - priorityRank(right.priority)
        || left.phase.localeCompare(right.phase)
        || left.id - right.id
    })
}

function nextFeature(features: Feature[], attempted: Set<number>) {
  return features.find((item) => !attempted.has(item.id)) ?? features[0]
}

function statusSnapshot(features: Feature[]) {
  return new Map(features.map((item) => [item.id, item.status]))
}

function changedFeatures(before: Map<number, FeatureStatus>, after: Feature[]) {
  return after
    .filter((item) => before.get(item.id) && before.get(item.id) !== item.status)
    .map((item) => `Req ${item.id}: ${before.get(item.id)} -> ${item.status}`)
}

function writeFeaturePrompt(features: Feature[]) {
  fs.mkdirSync(promptsDir, { recursive: true })
  const selected = features.slice(0, 8)
  const promptFile = path.join(promptsDir, 'FEATURE-DEVELOPMENT-CONTEXT.md')
  const lines = [
    '# Docmee Features Development',
    '',
    'Continue Docmee feature development from the open Rev 1 coverage queue.',
    '',
    'Rules:',
    '- Work locally first.',
    '- Keep changes focused on the listed feature gaps.',
    '- Do not mark a feature complete unless the code and local verification support it.',
    '- Update tools/logs/rev1-feature-coverage.json after each completed or materially advanced feature.',
    '- Run the relevant local checks before stopping.',
    '- Commit useful completed work with a clear message.',
    '- After completing one feature, stop cleanly; DevTools will automatically launch the next session for the next open feature.',
    '',
    `Open feature count: ${features.length}`,
    '',
    'Start with these highest-priority items:',
    '',
    ...selected.flatMap((item) => [
      `## Requirement ${item.id}: ${item.feature}`,
      `Phase: ${item.phase}`,
      `Area: ${item.area}`,
      `Current status: ${item.status}`,
      `Priority: ${item.priority}`,
      `Evidence: ${item.evidence}`,
      `Next step: ${item.nextStep}`,
      ''
    ])
  ]
  fs.writeFileSync(promptFile, `${lines.join('\n')}\n`)
  return promptFile
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isClaudeLimitMessage(output: string) {
  return /usage limit|session limit|rate limit|resets?\s+\d/i.test(output)
}

function parseClaudeResetTime(output: string) {
  const match = output.match(/resets?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (!match) return null
  const reset = new Date()
  let hour = Number(match[1])
  const minute = Number(match[2] ?? '0')
  const meridiem = match[3].toLowerCase()
  if (meridiem === 'pm' && hour < 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0
  reset.setHours(hour, minute, 0, 0)
  if (reset.getTime() <= Date.now()) reset.setDate(reset.getDate() + 1)
  return reset
}

async function waitForClaudeRefresh(feature: Feature, output: string) {
  const resetAt = parseClaudeResetTime(output) ?? new Date(Date.now() + 5 * 60 * 60 * 1000)
  const resumeAt = new Date(resetAt.getTime() + claudeLimitResumeBufferMs)
  const message = `Feature development paused: Claude session limit reached. Resume at ${resumeAt.toLocaleString()}.`
  touchFeatureRun({
    phase: feature.phase,
    workflow: 'features-development',
    status: 'paused',
    resumeAt: resumeAt.toISOString(),
    message
  })
  await sendNotification(message, 'critical')
  while (Date.now() < resumeAt.getTime()) {
    touchFeatureRun({
      phase: feature.phase,
      workflow: 'features-development',
      status: 'paused',
      resumeAt: resumeAt.toISOString(),
      message
    })
    await sleep(Math.min(60_000, Math.max(1_000, resumeAt.getTime() - Date.now())))
  }
  touchFeatureRun({
    phase: feature.phase,
    workflow: 'features-development',
    status: 'running',
    resumeAt: undefined,
    message: 'Claude limit refreshed; resuming feature development.'
  })
  await sendNotification('Claude limit refreshed. Feature development is resuming automatically.', 'development')
}

function runClaudeFeatureDevelopment(promptFile: string, firstFeature: Feature, sessionNumber: number) {
  return new Promise<ClaudeSessionResult>((resolve) => {
    const prompt = fs.readFileSync(promptFile, 'utf8')
    let output = ''
    touchFeatureRun({
      phase: firstFeature.phase,
      workflow: 'features-development',
      status: 'running',
      startedAt: new Date().toISOString(),
      message: `Session ${sessionNumber}: developing feature ${firstFeature.id}: ${firstFeature.feature}`
    })

    const child = spawn(claudeCodeCommand(), ['--print', '--dangerously-skip-permissions', '--add-dir', repoRoot()], {
      cwd: repoRoot(),
      env: claudeCodeEnvironment(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    const heartbeat = setInterval(() => {
      touchFeatureRun({
        pid: child.pid,
        phase: firstFeature.phase,
        workflow: 'features-development',
        status: 'running',
        message: `Session ${sessionNumber}: developing feature ${firstFeature.id}: ${firstFeature.feature}`
      })
    }, 10000)

    child.stdout.on('data', (chunk) => {
      const text = String(chunk)
      output += text
      log('feature', text.trim())
    })
    child.stderr.on('data', (chunk) => {
      const text = String(chunk)
      output += text
      log('feature', text.trim(), 'warn')
    })
    child.on('close', (code) => {
      clearInterval(heartbeat)
      touchFeatureRun({
        pid: child.pid,
        phase: firstFeature.phase,
        workflow: 'features-development',
        status: code === 0 ? 'running' : 'failed',
        message: code === 0
          ? `Session ${sessionNumber} finished; checking queue for next feature.`
          : `Session ${sessionNumber} failed with exit code ${code}`
      })
      resolve({ code: code ?? 1, output })
    })

    child.stdin.end(prompt)
  })
}

export const featureCmd = new Command('feature').description('Manage Docmee feature development')

featureCmd.command('watch')
  .description('Start automated Claude feature development from the open feature coverage queue')
  .option('--max-sessions <count>', 'Maximum Claude sessions to run before stopping', '50')
  .action(async (opts: { maxSessions: string }) => {
    const attempted = new Set<number>()
    const maxSessions = Math.max(1, Number(opts.maxSessions) || 50)
    let sessionNumber = 0

    while (sessionNumber < maxSessions) {
      const features = openFeatures()
      if (features.length === 0) {
        touchFeatureRun({ workflow: 'features-development', status: 'complete', message: 'All features are complete' })
        log('feature', 'All features are complete.')
        await sendNotification('Feature development automation completed. All Rev 1 features are marked complete.', 'development')
        await closeDiscordClient()
        return
      }

      const feature = nextFeature(features, attempted)
      const before = statusSnapshot(readFeatures())
      const promptFile = writeFeaturePrompt([feature, ...features.filter((item) => item.id !== feature.id)])
      sessionNumber += 1
      attempted.add(feature.id)
      const headBefore = currentHead()
      log('feature', `Starting feature development session ${sessionNumber}/${maxSessions} with ${features.length} open feature(s). Prompt: ${promptFile}`)
      await sendNotification(`Feature development session ${sessionNumber} started. ${features.length} open feature(s). Working on Req ${feature.id} - ${feature.feature}.`, 'development')

      const result = await runClaudeFeatureDevelopment(promptFile, feature, sessionNumber)
      const allAfter = readFeatures()
      const updatedOpen = openFeatures()
      const changes = changedFeatures(before, allAfter)

      if (result.code !== 0) {
        if (isClaudeLimitMessage(result.output)) {
          await waitForClaudeRefresh(feature, result.output)
          attempted.delete(feature.id)
          continue
        }
        await sendNotification(`Feature development failed during Req ${feature.id} - ${feature.feature}. Fix the blocker, then resume.`, 'critical')
        await closeDiscordClient()
        process.exitCode = result.code
        return
      }

      const githubSync = await pushFeatureCommits(headBefore, feature)
      if (!githubSync.ok) {
        await closeDiscordClient()
        process.exitCode = 1
        return
      }

      await sendNotification(
        `Feature development session ${sessionNumber} finished. ${updatedOpen.length} feature(s) remain open. GitHub sync: ${githubSync.message}${changes.length ? ` Changes: ${changes.join('; ')}` : ' No status change detected; moving to the next open feature.'}`,
        'development'
      )

      if (updatedOpen.length === 0) {
        touchFeatureRun({ workflow: 'features-development', status: 'complete', message: 'All features are complete' })
        await sendNotification('Feature development automation completed. All Rev 1 features are marked complete.', 'development')
        await closeDiscordClient()
        return
      }

      if (attempted.size >= updatedOpen.length && updatedOpen.every((item) => attempted.has(item.id))) {
        attempted.clear()
        log('feature', 'All currently open features have had a session attempt; cycling through the remaining queue again.')
      }

      touchFeatureRun({
        phase: updatedOpen[0]?.phase ?? feature.phase,
        workflow: 'features-development',
        status: 'running',
        message: `Continuing feature queue. ${updatedOpen.length} feature(s) remain open.`
      })
    }

    const remaining = openFeatures()
    touchFeatureRun({
      workflow: 'features-development',
      status: remaining.length === 0 ? 'complete' : 'stopped',
      message: remaining.length === 0 ? 'All features are complete' : `Stopped after max session limit. ${remaining.length} feature(s) remain open.`
    })
    await sendNotification(`Feature development stopped after ${maxSessions} session(s). ${remaining.length} feature(s) remain open.`, remaining.length === 0 ? 'development' : 'critical')
    await closeDiscordClient()
    process.exitCode = remaining.length === 0 ? 0 : 1
  })
