import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { NextResponse } from 'next/server'

const toolsRoot = path.resolve(process.cwd(), '..')
const envFile = path.join(toolsRoot, '.env.tools')
const envExampleFile = path.join(toolsRoot, '.env.tools.example')
const backlogFile = path.join(toolsRoot, 'logs', 'backlog.json')

function settingsRedirect(request: Request, key: 'message' | 'error', value: string) {
  const url = new URL('/settings', 'http://127.0.0.1:4000')
  url.searchParams.set(key, value)
  return NextResponse.redirect(url, 303)
}

function openEnvFile() {
  if (process.platform === 'win32') {
    spawn('notepad.exe', [envFile], { detached: true, stdio: 'ignore' }).unref()
    return
  }
  if (process.platform === 'darwin') {
    spawn('open', [envFile], { detached: true, stdio: 'ignore' }).unref()
    return
  }
  spawn('xdg-open', [envFile], { detached: true, stdio: 'ignore' }).unref()
}

function pnpmCommand() {
  if (process.platform !== 'win32') return 'pnpm'
  const localAppData = process.env.LOCALAPPDATA
  const pnpmExe = localAppData ? path.join(localAppData, 'pnpm', 'pnpm.exe') : ''
  return pnpmExe && existsSync(pnpmExe) ? pnpmExe : 'pnpm.exe'
}

function runTool(args: string[]) {
  const result = spawnSync(pnpmCommand(), ['tool', ...args], {
    cwd: toolsRoot,
    encoding: 'utf8',
    shell: false,
    stdio: 'pipe'
  })
  return result.status === 0
}

function runScript(script: string) {
  const result = spawnSync(pnpmCommand(), [script], {
    cwd: toolsRoot,
    encoding: 'utf8',
    shell: false,
    stdio: 'pipe'
  })
  return result.status === 0
}

function backlogCount() {
  if (!existsSync(backlogFile)) return 0
  try {
    const backlog = JSON.parse(readFileSync(backlogFile, 'utf8')) as unknown
    return Array.isArray(backlog) ? backlog.length : 0
  } catch {
    return 0
  }
}

function parseEnv(content: string) {
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1)]
      })
  )
}

function setupStatus() {
  const required = [
    'TOOLS_DB_URL',
    'TOOLS_DB_SERVICE_KEY',
    'MONOREPO_ROOT',
    'NEXT_PUBLIC_DASHBOARD_PORT',
    'WEBHOOK_TARGET',
    'DEV_LICENSE_SIGNING_KEY'
  ]
  const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}
  const missing = required.filter((name) => !env[name])
  const issues = [
    existsSync(envFile) ? '' : '.env.tools',
    missing.length === 0 ? '' : `required settings (${missing.join(', ')})`,
    backlogCount() >= 45 ? '' : 'backlog'
  ].filter(Boolean)
  return { ok: issues.length === 0, issues }
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''
  const isFormPost = contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')
  const body = isFormPost
    ? Object.fromEntries(await request.formData()) as { action?: string }
    : await request.json().catch(() => ({})) as { action?: string }

  if (body.action === 'create') {
    if (existsSync(envFile)) {
      return isFormPost
        ? settingsRedirect(request, 'message', '.env.tools already exists')
        : NextResponse.json({ message: '.env.tools already exists' })
    }
    if (!existsSync(envExampleFile)) {
      return isFormPost
        ? settingsRedirect(request, 'error', '.env.tools.example was not found')
        : NextResponse.json({ error: '.env.tools.example was not found' }, { status: 404 })
    }
    copyFileSync(envExampleFile, envFile)
    return isFormPost
      ? settingsRedirect(request, 'message', 'Created .env.tools from the example file')
      : NextResponse.json({ message: 'Created .env.tools from the example file' })
  }

  if (body.action === 'auto-setup') {
    const setupOk = runTool(['setup'])
    const backlogOk = backlogCount() >= 45
    runTool(['agents', 'reset'])
    const status = setupStatus()
    const ok = setupOk && backlogOk && status.issues.filter((issue) => issue !== 'backlog').length === 0
    const message = ok
      ? 'Local setup is ready. Add service keys only when you want Discord, Notion, AI, Meta, or VPS features.'
      : `Local setup prepared, but still needs: ${status.issues.join(', ')}`
    return isFormPost
      ? settingsRedirect(request, ok ? 'message' : 'error', message)
      : NextResponse.json(ok ? { message } : { error: message }, { status: ok ? 200 : 500 })
  }

  if (body.action === 'open') {
    if (!existsSync(envFile)) {
      return isFormPost
        ? settingsRedirect(request, 'error', '.env.tools has not been created yet')
        : NextResponse.json({ error: '.env.tools has not been created yet' }, { status: 404 })
    }
    openEnvFile()
    return isFormPost
      ? settingsRedirect(request, 'message', 'Opened .env.tools in your local editor')
      : NextResponse.json({ message: 'Opened .env.tools in your local editor' })
  }

  if (body.action === 'seed-backlog') {
    const ok = runTool(['backlog', 'init'])
    return isFormPost
      ? settingsRedirect(request, ok ? 'message' : 'error', ok ? 'Seeded the local DevTools backlog' : 'Backlog seed failed')
      : NextResponse.json(ok ? { message: 'Seeded the local DevTools backlog' } : { error: 'Backlog seed failed' }, { status: ok ? 200 : 500 })
  }

  if (body.action === 'check') {
    const status = setupStatus()
    const message = status.ok ? 'Setup check passed' : `Setup needs attention: ${status.issues.join(', ')}`
    return isFormPost
      ? settingsRedirect(request, status.ok ? 'message' : 'error', message)
      : NextResponse.json(status.ok ? { message } : { error: message }, { status: status.ok ? 200 : 500 })
  }

  return isFormPost
    ? settingsRedirect(request, 'error', 'Unknown settings action')
    : NextResponse.json({ error: 'Unknown settings action' }, { status: 400 })
}
