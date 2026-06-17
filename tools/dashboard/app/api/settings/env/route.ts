import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { NextResponse } from 'next/server'

const toolsRoot = path.resolve(process.cwd(), '..')
const envFile = path.join(toolsRoot, '.env.tools')
const envExampleFile = path.join(toolsRoot, '.env.tools.example')
const backlogFile = path.join(toolsRoot, 'logs', 'backlog.json')

function settingsRedirect(request: Request, key: 'message' | 'error', value: string) {
  const url = new URL('/settings', request.url)
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
    const envOk = runTool(['env', 'check'])
    const backlogOk = backlogCount() === 45
    const typecheckOk = runScript('typecheck')
    const lintOk = runScript('lint')
    const dalOk = runTool(['dal', 'check'])
    const gatesOk = typecheckOk && lintOk && dalOk
    const ok = envOk && backlogOk && gatesOk
    const message = ok
      ? 'Setup check passed'
      : `Setup needs attention: ${[
        envOk ? '' : 'env',
        backlogOk ? '' : 'backlog',
        typecheckOk ? '' : 'typecheck',
        lintOk ? '' : 'lint',
        dalOk ? '' : 'dal'
      ].filter(Boolean).join(', ')}`
    return isFormPost
      ? settingsRedirect(request, ok ? 'message' : 'error', message)
      : NextResponse.json(ok ? { message } : { error: message }, { status: ok ? 200 : 500 })
  }

  return isFormPost
    ? settingsRedirect(request, 'error', 'Unknown settings action')
    : NextResponse.json({ error: 'Unknown settings action' }, { status: 400 })
}
