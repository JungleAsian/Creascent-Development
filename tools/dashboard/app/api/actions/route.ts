import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import { NextResponse } from 'next/server'

const toolsRoot = path.resolve(process.cwd(), '..')
const repoRoot = path.resolve(toolsRoot, '..')
const startReadinessFile = path.join(toolsRoot, 'logs', 'start-readiness.json')
const logsRoot = path.join(toolsRoot, 'logs')
const buildRunFile = path.join(logsRoot, 'build-run.json')
const claudeUsageGuardFile = path.join(logsRoot, 'claude-usage-guard.json')
const appLaunchFile = path.join(logsRoot, 'app-launch.json')
const postDeploymentFile = path.join(logsRoot, 'post-deployment.json')

type PostDeploymentCheck = {
  name: string
  status: 'pass' | 'warning' | 'fail'
  message: string
  detail?: string
}

type PostDeploymentRun = {
  id: string
  createdAt: string
  summary: { pass: number; warning: number; fail: number }
  checks: PostDeploymentCheck[]
}

function pnpmCommand() {
  if (process.platform !== 'win32') return 'pnpm'
  const localAppData = process.env.LOCALAPPDATA
  const pnpmExe = localAppData ? path.join(localAppData, 'pnpm', 'pnpm.exe') : ''
  return pnpmExe && existsSync(pnpmExe) ? pnpmExe : 'pnpm.exe'
}

function redirect(request: Request, key: 'message' | 'error', value: string) {
  const referer = request.headers.get('referer') ?? 'http://127.0.0.1:4000/settings'
  const url = new URL(referer)
  url.searchParams.set(key, value)
  return NextResponse.redirect(url, 303)
}

function runTool(args: string[]) {
  const result = spawnSync(pnpmCommand(), ['tool', ...args], {
    cwd: toolsRoot,
    encoding: 'utf8',
    shell: false,
    stdio: 'pipe'
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return { ok: result.status === 0, output }
}

function runRepo(args: string[]) {
  const result = spawnSync(pnpmCommand(), args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    stdio: 'pipe',
    windowsHide: true
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return { ok: result.status === 0, output }
}

function shortOutput(output: string) {
  return output.replace(/\s+/g, ' ').trim().slice(0, 220)
}

function dockerOutput(output: string) {
  const cleaned = output
    .split(/\r?\n/)
    .filter((line) => !line.includes('the attribute `version` is obsolete'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || output.replace(/\s+/g, ' ').trim()).slice(0, 320)
}

function readJson<T>(file: string, fallback: T) {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function appendPostDeploymentRun(checks: PostDeploymentCheck[]) {
  const runs = readJson<PostDeploymentRun[]>(postDeploymentFile, [])
  const summary = {
    pass: checks.filter((check) => check.status === 'pass').length,
    warning: checks.filter((check) => check.status === 'warning').length,
    fail: checks.filter((check) => check.status === 'fail').length
  }
  const run: PostDeploymentRun = {
    id: `post-${Date.now()}`,
    createdAt: new Date().toISOString(),
    summary,
    checks
  }
  writeFileSync(postDeploymentFile, JSON.stringify([run, ...runs].slice(0, 50), null, 2))
  return run
}

async function fetchCheck(
  name: string,
  url: string,
  options: RequestInit = {},
  expectedStatus = 200
): Promise<PostDeploymentCheck> {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const body = await response.text()
    const elapsed = Date.now() - started
    return {
      name,
      status: response.status === expectedStatus ? 'pass' : 'fail',
      message: response.status === expectedStatus ? `HTTP ${response.status} in ${elapsed}ms` : `Expected HTTP ${expectedStatus}, got HTTP ${response.status}`,
      detail: body.slice(0, 500)
    }
  } catch (error) {
    return {
      name,
      status: 'fail',
      message: error instanceof Error ? error.message : String(error)
    }
  } finally {
    clearTimeout(timer)
  }
}

async function runPostDeploymentChecks() {
  const checks: PostDeploymentCheck[] = []

  const docker = spawnSync(process.platform === 'win32' ? 'docker.exe' : 'docker', ['info'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true
  })
  checks.push({
    name: 'Docker engine',
    status: docker.status === 0 ? 'pass' : 'fail',
    message: docker.status === 0 ? 'Docker Desktop engine is running.' : dockerOutput(`${docker.stdout ?? ''}${docker.stderr ?? ''}`) || 'Docker Desktop engine is not running.'
  })

  checks.push({
    name: 'Postgres port',
    status: await portOpen(5432) ? 'pass' : 'fail',
    message: await portOpen(5432) ? 'Postgres is reachable on localhost:5432.' : 'Postgres is not reachable on localhost:5432.'
  })
  checks.push({
    name: 'Redis port',
    status: await portOpen(6379) ? 'pass' : 'fail',
    message: await portOpen(6379) ? 'Redis is reachable on localhost:6379.' : 'Redis is not reachable on localhost:6379.'
  })
  checks.push({
    name: 'Inbox UI',
    status: await portOpen(3000) ? 'pass' : 'fail',
    message: await portOpen(3000) ? 'Inbox UI is reachable on localhost:3000.' : 'Inbox UI is not reachable on localhost:3000.'
  })
  checks.push({
    name: 'API port',
    status: await portOpen(3001) ? 'pass' : 'fail',
    message: await portOpen(3001) ? 'API is reachable on localhost:3001.' : 'API is not reachable on localhost:3001.'
  })

  checks.push(await fetchCheck('API health', 'http://127.0.0.1:3001/health'))
  checks.push(await fetchCheck('Login page', 'http://127.0.0.1:3000/login'))

  const login = await fetchCheck('Demo login', 'http://127.0.0.1:3001/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo-a.test', password: 'demo1234' })
  })
  let accessToken = ''
  let clinicId = ''
  if (login.status === 'pass' && login.detail) {
    try {
      const payload = JSON.parse(login.detail) as { accessToken?: string; user?: { clinicId?: string } }
      accessToken = payload.accessToken ?? ''
      clinicId = payload.user?.clinicId ?? ''
      login.message = accessToken ? 'Demo login succeeded.' : 'Login response did not include an access token.'
      login.status = accessToken ? 'pass' : 'fail'
    } catch {
      login.status = 'fail'
      login.message = 'Login response was not valid JSON.'
    }
  }
  checks.push(login)

  if (accessToken) {
    const authHeaders = { authorization: `Bearer ${accessToken}` }
    checks.push(await fetchCheck('Conversations API', 'http://127.0.0.1:3001/conversations', { headers: authHeaders }))
    if (clinicId) {
      checks.push(await fetchCheck('Clinic team API', `http://127.0.0.1:3001/clinics/${clinicId}/team`, { headers: authHeaders }))
      checks.push(await fetchCheck('Clinic patients API', `http://127.0.0.1:3001/clinics/${clinicId}/patients`, { headers: authHeaders }))
      checks.push(await fetchCheck('Clinic metrics API', `http://127.0.0.1:3001/clinics/${clinicId}/metrics`, { headers: authHeaders }))
    } else {
      checks.push({ name: 'Clinic API checks', status: 'warning', message: 'Skipped because login did not return a clinic ID.' })
    }
  } else {
    checks.push({ name: 'Authenticated API checks', status: 'warning', message: 'Skipped because demo login failed.' })
  }

  return appendPostDeploymentRun(checks)
}

function claudeSmokeBlocker(output: string) {
  try {
    const result = JSON.parse(output) as { categories?: Array<{ checks?: Array<{ name?: string; status?: string; message?: string; fix?: string }> }> }
    return result.categories
      ?.flatMap((category) => category.checks ?? [])
      .find((check) => check.name === 'Claude Code build smoke test' && check.status === 'critical')
  } catch {
    return undefined
  }
}

function saveStartReadiness(phase: string, steps: Array<{ name: string; status: 'pass' | 'fail'; message: string }>) {
  const failed = steps.find((step) => step.status === 'fail')
  writeFileSync(startReadinessFile, JSON.stringify({
    createdAt: new Date().toISOString(),
    phase,
    ready: !failed,
    steps
  }, null, 2))
  return !failed
}

function runToolDetached(args: string[]) {
  const child = spawn(pnpmCommand(), ['tool', ...args], {
    cwd: toolsRoot,
    shell: false,
    stdio: 'ignore',
    detached: true,
    windowsHide: true
  })
  child.unref()
  return child.pid
}

function runRepoDetached(args: string[]) {
  const child = spawn(pnpmCommand(), args, {
    cwd: repoRoot,
    shell: false,
    stdio: 'ignore',
    detached: true,
    windowsHide: true
  })
  child.unref()
  return child.pid
}

function openUrl(url: string) {
  if (process.platform === 'win32') {
    const child = spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    return
  }
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open'
  const child = spawn(command, [url], { detached: true, stdio: 'ignore' })
  child.unref()
}

function portOpen(port: number, host = '127.0.0.1') {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect(port, host)
    socket.setTimeout(900)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(false))
  })
}

async function launchProductApp() {
  const steps: Array<{ name: string; status: 'pass' | 'warning' | 'fail'; message: string }> = []

  if (process.platform === 'win32') {
    const docker = spawnSync('docker.exe', ['compose', 'up', '-d'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
      windowsHide: true
    })
    steps.push({
      name: 'Local database',
      status: docker.status === 0 ? 'pass' : 'fail',
      message: docker.status === 0 ? 'Postgres and Redis are running.' : dockerOutput(`${docker.stdout ?? ''}${docker.stderr ?? ''}`) || 'Docker was not available. Use Docker Desktop, then retry.'
    })
  } else {
    const docker = spawnSync('docker', ['compose', 'up', '-d'], { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' })
    steps.push({
      name: 'Local database',
      status: docker.status === 0 ? 'pass' : 'fail',
      message: docker.status === 0 ? 'Postgres and Redis are running.' : dockerOutput(`${docker.stdout ?? ''}${docker.stderr ?? ''}`) || 'Docker was not available. Start Docker, then retry.'
    })
  }

  if (steps.some((step) => step.status === 'fail')) {
    const payload = {
      createdAt: new Date().toISOString(),
      url: 'http://127.0.0.1:3000',
      healthUrl: 'http://127.0.0.1:3001/health',
      demoLogin: { email: 'admin@demo-a.test', password: 'demo1234' },
      pids: {},
      steps
    }
    writeFileSync(appLaunchFile, JSON.stringify(payload, null, 2))
    return { ok: false, steps, message: steps.find((step) => step.status === 'fail')?.message ?? 'Local launch failed.' }
  }

  const migrate = runRepo(['--filter', '@docmee/db', 'db:migrate'])
  steps.push({
    name: 'Database tables',
    status: migrate.ok ? 'pass' : 'fail',
    message: migrate.ok ? 'Database tables are ready.' : shortOutput(migrate.output) || 'Database migration failed.'
  })

  if (migrate.ok) {
    const seed = runRepo(['--filter', '@docmee/db', 'db:seed'])
    steps.push({
      name: 'Demo login',
      status: seed.ok ? 'pass' : 'warning',
      message: seed.ok ? 'Demo clinic data is ready.' : shortOutput(seed.output) || 'Demo data may already exist.'
    })
  }

  if (steps.some((step) => step.status === 'fail')) {
    const payload = {
      createdAt: new Date().toISOString(),
      url: 'http://127.0.0.1:3000',
      healthUrl: 'http://127.0.0.1:3001/health',
      demoLogin: { email: 'admin@demo-a.test', password: 'demo1234' },
      pids: {},
      steps
    }
    writeFileSync(appLaunchFile, JSON.stringify(payload, null, 2))
    return { ok: false, steps, message: steps.find((step) => step.status === 'fail')?.message ?? 'Local launch failed.' }
  }

  const services = [
    { name: 'API', port: 3001, args: ['--filter', '@docmee/api', 'dev'] },
    { name: 'Inbox UI', port: 3000, args: ['--filter', '@docmee/inboxos', 'dev'] },
    { name: 'Workers', port: 0, args: ['--filter', '@docmee/workers', 'dev'] },
    { name: 'License service', port: 3002, args: ['--filter', '@docmee/licensekit', 'dev'] }
  ] as const

  const pids: Record<string, number | undefined> = {}
  for (const service of services) {
    const alreadyRunning = service.port > 0 ? await portOpen(service.port) : false
    if (alreadyRunning) {
      steps.push({ name: service.name, status: 'pass', message: `${service.name} is already running.` })
      continue
    }
    pids[service.name] = runRepoDetached([...service.args])
    steps.push({ name: service.name, status: 'pass', message: `${service.name} started in the background.` })
  }

  const payload = {
    createdAt: new Date().toISOString(),
    url: 'http://127.0.0.1:3000',
    healthUrl: 'http://127.0.0.1:3001/health',
    demoLogin: { email: 'admin@demo-a.test', password: 'demo1234' },
    pids,
    steps
  }
  writeFileSync(appLaunchFile, JSON.stringify(payload, null, 2))
  openUrl('http://127.0.0.1:3000')
  return { ok: true, steps, message: 'Application launched.' }
}

function productAccessMessage() {
  return [
    'Docmee application is ready for local checking.',
    'App URL: http://127.0.0.1:3000',
    'API Health: http://127.0.0.1:3001/health',
    'Demo login email: admin@demo-a.test',
    'Demo password: demo1234',
    'Note: This is local to the DevTools computer. Use VPS/domain after deployment for external access.'
  ].join('\n')
}

function postDeploymentDiscordMessage(run: PostDeploymentRun) {
  const lines = [
    'Post-deployment functionality check completed.',
    `Result: ${run.summary.pass} passed, ${run.summary.warning} warnings, ${run.summary.fail} issues.`,
    `Run time: ${new Date(run.createdAt).toLocaleString()}`,
    '',
    'Findings:'
  ]
  for (const check of run.checks) {
    const label = check.status === 'pass' ? 'PASS' : check.status === 'warning' ? 'WARNING' : 'ISSUE'
    lines.push(`- ${label}: ${check.name} - ${check.message}`)
  }
  return lines.join('\n').slice(0, 1800)
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

function activeBuildRun() {
  if (!existsSync(buildRunFile)) return null
  try {
    const data = JSON.parse(readFileSync(buildRunFile, 'utf8')) as { pid?: number; status?: string; phase?: string }
    return isProcessAlive(data.pid) && ['starting', 'running', 'paused'].includes(data.status ?? '') ? data : null
  } catch {
    return null
  }
}

function stopProcessTree(pid?: number) {
  if (!pid || !isProcessAlive(pid)) return false
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8', stdio: 'pipe' })
    return !isProcessAlive(pid)
  }
  try {
    process.kill(pid, 'SIGTERM')
    return true
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const form = await request.formData()
  const action = String(form.get('action') ?? '')

  if (action === 'app-launch') {
    const result = await launchProductApp()
    if (result.ok) {
      runTool(['discord', 'send', '--type', 'development', '--message', productAccessMessage()])
    }
    return redirect(
      request,
      result.ok ? 'message' : 'error',
      result.ok ? 'Application launched. Access details were posted to Discord.' : `Application launch blocked: ${result.message}`
    )
  }

  if (action === 'post-deploy-check') {
    const run = await runPostDeploymentChecks()
    runTool(['discord', 'send', '--type', run.summary.fail > 0 ? 'critical' : 'development', '--message', postDeploymentDiscordMessage(run)])
    const failed = run.summary.fail > 0
    return redirect(
      request,
      failed ? 'error' : 'message',
      failed
        ? `Post-deployment check found ${run.summary.fail} issue${run.summary.fail === 1 ? '' : 's'}.`
        : 'Post-deployment check passed.'
    )
  }

  if (action === 'gates-run') {
    const result = runTool(['gates', 'check'])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'All gates passed' : 'One or more gates failed')
  }

  if (action === 'ready-run' || action === 'ready-fix') {
    const args = action === 'ready-fix' ? ['ready', '--fix'] : ['ready']
    const result = runTool(args)
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'DevTools is ready' : 'Readiness check found critical issues')
  }

  if (action === 'start-readiness') {
    const phase = String(form.get('phase') ?? 'P01')
    const steps: Array<{ name: string; status: 'pass' | 'fail'; message: string }> = []

    const ready = runTool(['ready', '--json'])
    steps.push({
      name: 'Setup Check',
      status: ready.ok ? 'pass' : 'fail',
      message: ready.ok ? 'Ready Check passed. Claude Pro, Notion, GitHub, prompts, and Discord are usable.' : shortOutput(ready.output) || 'Ready Check found a blocker.'
    })

    if (ready.ok) {
      const context = runTool(['phase', 'context', '--phase', phase])
      steps.push({
        name: `${phase} Context`,
        status: context.ok ? 'pass' : 'fail',
        message: context.ok ? `${phase} build context prepared.` : shortOutput(context.output) || `${phase} context could not be prepared.`
      })
    }

    if (steps.every((step) => step.status === 'pass')) {
      const dryRun = runTool(['phase', 'build', '--from', phase, '--dry-run', '--no-sync'])
      steps.push({
        name: 'Safe Build Test',
        status: dryRun.ok ? 'pass' : 'fail',
        message: dryRun.ok ? 'Dry run passed. Start can launch without hidden setup work.' : shortOutput(dryRun.output) || 'Dry run found a build blocker.'
      })
    }

    const ok = saveStartReadiness(phase, steps)
    return redirect(request, ok ? 'message' : 'error', ok ? 'Start Check passed. You can start the automated build.' : 'Start Check found something that needs attention.')
  }

  if (action === 'seed') {
    const kind = String(form.get('kind') ?? 'all')
    const result = runTool(['seed', kind])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? `Seeded ${kind}` : `Seed ${kind} failed`)
  }

  if (action === 'webhook-send') {
    const payload = String(form.get('payload') ?? 'text-message')
    const result = runTool(['webhook', 'send', '--payload', payload])
    const label = payload.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ')
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? `${label} test sent` : `${label} test failed`)
  }

  if (action === 'phase-start' || action === 'phase-done') {
    const phase = String(form.get('phase') ?? '')
    const command = action === 'phase-start' ? 'start' : 'done'
    const result = runTool(['phase', command, phase])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? `${phase} ${command === 'start' ? 'started' : 'completed'}` : `${phase} ${command} failed`)
  }

  if (action === 'phase-sync') {
    const result = runTool(['phase', 'sync'])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'Phase prompts synced or cache checked' : 'Phase prompt sync failed')
  }

  if (action === 'phase-context') {
    const phase = String(form.get('phase') ?? 'P01')
    const result = runTool(['phase', 'context', '--phase', phase])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? `${phase} context prepared` : `${phase} context failed`)
  }

  if (action === 'phase-output-copied') {
    const phase = String(form.get('phase') ?? 'P01')
    const status = runTool(['phase', 'status', '--phase', phase, '--status', 'output-copied', '--notes', 'Output copied to repo from dashboard'])
    if (!status.ok) return redirect(request, 'error', `${phase} status update failed`)
    const pid = runToolDetached(['phase', 'continue', '--phase', phase])
    return redirect(request, 'message', `${phase} marked output copied; completion worker started${pid ? ` (${pid})` : ''}`)
  }

  if (action === 'phase-poll') {
    const phase = String(form.get('phase') ?? 'P01')
    const status = String(form.get('status') ?? 'output-copied')
    const result = runTool(['phase', 'poll', '--phase', phase, '--status', status])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? `${phase} status matched ${status}` : `${phase} is not ${status} yet`)
  }

  if (action === 'phase-build' || action === 'phase-build-dry-run') {
    const from = String(form.get('from') ?? 'P01')
    const args = ['phase', 'build', '--from', from]
    if (action === 'phase-build-dry-run') args.push('--dry-run')
    if (action === 'phase-build') {
      const pid = runToolDetached(args)
      return redirect(request, 'message', `Automated build started from ${from}${pid ? ` (${pid})` : ''}`)
    }
    const result = runTool(args)
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'Phase build command completed' : 'Phase build command failed')
  }

  if (action === 'phase-build-watch') {
    const from = String(form.get('from') ?? 'P01')
    const active = activeBuildRun()
    if (active) return redirect(request, 'error', `Build is already running from ${active.phase ?? 'current phase'}. Stop it before starting another one.`)
    const pid = runToolDetached(['phase', 'watch', '--from', from])
    writeFileSync(buildRunFile, JSON.stringify({
      pid,
      phase: from,
      status: 'starting',
      startedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      message: `Automated build watcher started from ${from}`
    }, null, 2))
    return redirect(request, 'message', `Automated build watcher started from ${from}${pid ? ` (${pid})` : ''}`)
  }

  if (action === 'phase-build-stop') {
    const current = existsSync(buildRunFile)
      ? JSON.parse(readFileSync(buildRunFile, 'utf8')) as { pid?: number; phase?: string }
      : {}
    const stopped = stopProcessTree(current.pid)
    writeFileSync(buildRunFile, JSON.stringify({
      ...current,
      status: 'stopped',
      heartbeatAt: new Date().toISOString(),
      message: stopped ? 'Build stopped from dashboard' : 'No live build process was found'
    }, null, 2))
    if (current.phase) {
      runTool(['phase', 'status', '--phase', current.phase, '--status', 'pending', '--notes', 'Build stopped from dashboard'])
    }
    return redirect(request, stopped ? 'message' : 'error', stopped ? 'Build stopped' : 'No live build process was found')
  }

  if (action === 'phase-build-control-init') {
    const result = runTool(['phase', 'sync', '--init'])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'Build Control database ready' : 'Build Control setup failed')
  }

  if (action === 'claude-switch-reset-guard') {
    try {
      writeFileSync(claudeUsageGuardFile, JSON.stringify({
        thresholdPercent: 95,
        notes: 'Reset after Claude account switch. DevTools will relearn the active Max session limit.',
        updatedAt: new Date().toISOString()
      }, null, 2))
      return redirect(request, 'message', 'Claude usage guard reset for the new account')
    } catch {
      return redirect(request, 'error', 'Claude usage guard reset failed')
    }
  }

  if (action === 'claude-switch-finalize') {
    const current = existsSync(buildRunFile)
      ? JSON.parse(readFileSync(buildRunFile, 'utf8')) as { pid?: number; phase?: string; startedAt?: string }
      : {}
    stopProcessTree(current.pid)
    writeFileSync(claudeUsageGuardFile, JSON.stringify({
      thresholdPercent: 95,
      notes: 'Reset after Claude account switch. DevTools will relearn the active account limit after Claude refresh.',
      updatedAt: new Date().toISOString()
    }, null, 2))
    writeFileSync(buildRunFile, JSON.stringify({
      ...current,
      status: 'stopped',
      heartbeatAt: new Date().toISOString(),
      message: 'Build stopped for Claude account switch. Ready Check will verify the new account.'
    }, null, 2))
    const result = runTool(['ready', '--json'])
    if (!result.ok) {
      const blocker = claudeSmokeBlocker(result.output)
      if (blocker) {
        writeFileSync(buildRunFile, JSON.stringify({
          ...current,
          status: 'stopped',
          heartbeatAt: new Date().toISOString(),
          message: `${blocker.message}${blocker.fix ? ` Fix: ${blocker.fix}` : ''}`
        }, null, 2))
      }
    }
    return redirect(
      request,
      result.ok ? 'message' : 'error',
      result.ok
        ? 'Claude account verified. You can resume the build.'
        : shortOutput(claudeSmokeBlocker(result.output)?.message ?? '') || 'Claude account saved, but Ready Check still needs attention before resume.'
    )
  }

  if (action === 'backlog-done') {
    const id = String(form.get('id') ?? '')
    const result = runTool(['backlog', 'done', '--id', id])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? `Marked task ${id} done` : `Task ${id} update failed`)
  }

  if (action === 'backlog-add') {
    const title = String(form.get('title') ?? '').trim()
    const phase = String(form.get('phase') ?? 'P01').trim()
    const priority = String(form.get('priority') ?? 'medium').trim()
    if (!title) return redirect(request, 'error', 'Task title is required')
    const result = runTool(['backlog', 'add', '--title', title, '--phase', phase, '--priority', priority])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'Task added' : 'Task add failed')
  }

  if (action === 'cost-log') {
    const provider = String(form.get('provider') ?? '').trim()
    const tokens = String(form.get('tokens') ?? '0').trim() || '0'
    if (!provider) return redirect(request, 'error', 'Provider is required')
    const result = runTool(['cost', 'log', '--provider', provider, '--tokens', tokens])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? `Logged ${provider} cost` : 'Cost log failed')
  }

  if (action === 'cost-dev-log') {
    const phase = String(form.get('phase') ?? '').trim()
    const feature = String(form.get('feature') ?? '').trim()
    const tool = String(form.get('tool') ?? '').trim()
    if (!phase || !feature || !tool) return redirect(request, 'error', 'Phase, feature, and tool are required')
    const result = runTool([
      'cost', 'dev', 'log',
      '--phase', phase,
      '--feature', feature,
      '--tool', tool,
      '--model', String(form.get('model') ?? 'o4-mini'),
      '--input', String(form.get('input') ?? '0'),
      '--output', String(form.get('output') ?? '0'),
      '--cached', String(form.get('cached') ?? '0'),
      '--minutes', String(form.get('minutes') ?? '0'),
      '--method', String(form.get('method') ?? 'manual'),
      '--notes', String(form.get('notes') ?? '')
    ])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'Development session logged' : 'Development cost log failed')
  }

  if (action === 'cost-dev-sync-claude') {
    const result = runTool(['cost', 'dev', 'sync-claude'])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'Claude Code cost synced' : 'Claude Code cost sync failed')
  }

  if (action === 'stack-refresh') {
    const source = String(form.get('source') ?? 'all')
    const args = source === 'grok'
      ? ['stack', 'news', '--grok']
      : source === 'claude'
        ? ['stack', 'news', '--claude']
        : ['stack', 'all']
    const result = runTool(args)
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'Stack Intelligence refreshed' : 'Stack Intelligence refresh failed')
  }

  if (action === 'stack-update-all') {
    if (String(form.get('confirm') ?? '') !== 'UPDATE_ALL_TECHNOLOGIES') {
      return redirect(request, 'error', 'Technology update was not confirmed')
    }
    const result = runTool(['stack', 'update-all'])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'Technology updates applied' : 'Technology update failed')
  }

  if (action === 'discord-test') {
    const result = runTool(['discord', 'test'])
    return redirect(
      request,
      result.ok ? 'message' : 'error',
      result.ok ? 'Discord test notification sent' : 'Discord test failed. Check the bot token, channel ID, and bot channel access.'
    )
  }

  if (action.startsWith('deploy-')) {
    const commandByAction: Record<string, string[]> = {
      'deploy-check': ['deploy', 'check'],
      'deploy-status': ['deploy', 'status'],
      'deploy-redis': ['deploy', 'redis'],
      'deploy-local': ['deploy', 'local'],
      'deploy-env': ['deploy', 'env'],
      'deploy-vps': ['deploy', 'vps'],
      'deploy-rollback': ['deploy', 'rollback']
    }
    const args = commandByAction[action]
    if (!args) return redirect(request, 'error', 'Unknown deploy action')
    const result = runTool(args)
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'Deploy command completed' : 'Deploy command reported a warning or failure')
  }

  if (action.startsWith('diagnose-')) {
    const category = String(form.get('category') ?? '')
    const commandByAction: Record<string, string[]> = {
      'diagnose-run': ['diagnose'],
      'diagnose-quick': ['diagnose', '--quick'],
      'diagnose-fix': ['diagnose', '--fix']
    }
    const args = commandByAction[action]
    if (!args) return redirect(request, 'error', 'Unknown diagnostic action')
    if (category) args.push('--category', category)
    const result = runTool(args)
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'Diagnostics completed' : 'Diagnostics found critical issues')
  }

  if (action.startsWith('agents-')) {
    const role = String(form.get('role') ?? '')
    const service = String(form.get('service') ?? '')
    const phase = String(form.get('phase') ?? 'P01')
    const commandByAction: Record<string, string[]> = {
      'agents-enable': ['agents', 'enable', '--role', role],
      'agents-disable': ['agents', 'disable', '--role', role],
      'agents-run': ['agents', 'run', '--role', role, '--phase', phase],
      'agents-test': ['agents', 'test', '--service', service],
      'agents-reset': ['agents', 'reset']
    }
    const args = commandByAction[action]
    if (!args) return redirect(request, 'error', 'Unknown agent action')
    const result = runTool(args)
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'Agent action completed' : 'Agent action needs configuration')
  }

  if (action === 'accept-run') {
    const step = String(form.get('step') ?? '')
    const args = step ? ['accept', '--step', step] : ['accept']
    const result = runTool(args)
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'Acceptance check passed' : 'Acceptance check needs product app phases')
  }

  return redirect(request, 'error', 'Unknown action')
}
