import { copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { NextResponse } from 'next/server'

const toolsRoot = path.resolve(process.cwd(), '..')
const envFile = path.join(toolsRoot, '.env.tools')
const envExampleFile = path.join(toolsRoot, '.env.tools.example')

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

  return isFormPost
    ? settingsRedirect(request, 'error', 'Unknown settings action')
    : NextResponse.json({ error: 'Unknown settings action' }, { status: 400 })
}
