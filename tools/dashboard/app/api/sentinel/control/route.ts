import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { NextResponse } from 'next/server'

const toolsRoot = path.resolve(process.cwd(), '..')
const logsRoot = path.join(toolsRoot, 'logs')
const daemonPidFile = path.join(logsRoot, 'sentinel-daemon.pid')
const daemonEntry = path.join(toolsRoot, 'sentinel', 'daemon.ts')
const tsxCli = path.join(toolsRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')

function readPid(): number | null {
  if (!existsSync(daemonPidFile)) return null
  const value = Number(readFileSync(daemonPidFile, 'utf8').trim())
  return Number.isInteger(value) ? value : null
}

function isAlive(pid: number | null) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// Detached node+tsx spawn is the reliable way to keep the daemon alive past this
// request on Windows (the CLI's `pnpm exec` variant drops the child).
function startDaemon() {
  const child = spawn(process.execPath, [tsxCli, daemonEntry], {
    cwd: toolsRoot,
    detached: true,
    windowsHide: true,
    stdio: 'ignore'
  })
  child.unref()
}

function stopDaemon(pid: number) {
  try {
    process.kill(pid)
  } catch {
    // Already gone.
  }
}

function redirect(request: Request, key: 'message' | 'error', value: string) {
  const referer = request.headers.get('referer') ?? 'http://127.0.0.1:4000/sentinel'
  const url = new URL(referer)
  url.searchParams.set(key, value)
  return NextResponse.redirect(url, 303)
}

export async function POST(request: Request) {
  const form = await request.formData()
  const action = String(form.get('action') ?? '')
  const pid = readPid()
  const alive = isAlive(pid)

  if (action === 'start') {
    if (alive) return redirect(request, 'message', `Sentinel is already running (pid ${pid}).`)
    startDaemon()
    return redirect(request, 'message', 'Sentinel daemon is starting…')
  }
  if (action === 'stop') {
    if (!alive || !pid) return redirect(request, 'message', 'Sentinel is already stopped.')
    stopDaemon(pid)
    return redirect(request, 'message', `Stopped Sentinel daemon (pid ${pid}).`)
  }
  if (action === 'restart') {
    if (alive && pid) stopDaemon(pid)
    setTimeout(startDaemon, 1500)
    return redirect(request, 'message', 'Sentinel daemon is restarting…')
  }
  return redirect(request, 'error', 'Unknown Sentinel action.')
}
