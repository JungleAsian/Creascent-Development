import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { NextResponse } from 'next/server'

const toolsRoot = path.resolve(process.cwd(), '..')

function pnpmCommand() {
  if (process.platform !== 'win32') return 'pnpm'
  const localAppData = process.env.LOCALAPPDATA
  const pnpmExe = localAppData ? path.join(localAppData, 'pnpm', 'pnpm.exe') : ''
  return pnpmExe && existsSync(pnpmExe) ? pnpmExe : 'pnpm.exe'
}

function redirect(request: Request, key: 'message' | 'error', value: string) {
  const referer = request.headers.get('referer') ?? 'http://localhost:4000/settings'
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

export async function POST(request: Request) {
  const form = await request.formData()
  const action = String(form.get('action') ?? '')

  if (action === 'gates-run') {
    const result = runTool(['gates', 'check'])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'All gates passed' : 'One or more gates failed')
  }

  if (action === 'seed') {
    const kind = String(form.get('kind') ?? 'all')
    const result = runTool(['seed', kind])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? `Seeded ${kind}` : `Seed ${kind} failed`)
  }

  if (action === 'webhook-send') {
    const payload = String(form.get('payload') ?? 'text-message')
    const result = runTool(['webhook', 'send', '--payload', payload])
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? `Sent ${payload}` : `Send ${payload} failed`)
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

  if (action === 'phase-build' || action === 'phase-build-dry-run') {
    const from = String(form.get('from') ?? 'P01')
    const args = ['phase', 'build', '--from', from]
    if (action === 'phase-build-dry-run') args.push('--dry-run')
    const result = runTool(args)
    return redirect(request, result.ok ? 'message' : 'error', result.ok ? 'Phase build command completed' : 'Phase build command failed')
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
      'deploy-web': ['deploy', 'web', '--qr'],
      'deploy-web-stop': ['deploy', 'web', '--stop'],
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
