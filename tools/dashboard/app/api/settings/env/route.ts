import { copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { NextResponse } from 'next/server'

const toolsRoot = path.resolve(process.cwd(), '..')
const envFile = path.join(toolsRoot, '.env.tools')
const envExampleFile = path.join(toolsRoot, '.env.tools.example')

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
  const body = await request.json().catch(() => ({})) as { action?: string }

  if (body.action === 'create') {
    if (existsSync(envFile)) {
      return NextResponse.json({ message: '.env.tools already exists' })
    }
    if (!existsSync(envExampleFile)) {
      return NextResponse.json({ error: '.env.tools.example was not found' }, { status: 404 })
    }
    copyFileSync(envExampleFile, envFile)
    return NextResponse.json({ message: 'Created .env.tools from the example file' })
  }

  if (body.action === 'open') {
    if (!existsSync(envFile)) {
      return NextResponse.json({ error: '.env.tools has not been created yet' }, { status: 404 })
    }
    openEnvFile()
    return NextResponse.json({ message: 'Opened .env.tools in your local editor' })
  }

  return NextResponse.json({ error: 'Unknown settings action' }, { status: 400 })
}
