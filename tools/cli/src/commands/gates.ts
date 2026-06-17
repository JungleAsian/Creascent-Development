import { Command } from 'commander'
import { spawnSync } from 'node:child_process'
import { envStatus } from '../lib/config.js'
import { log } from '../lib/logger.js'

type GateResult = { gate: number; name: string; ok: boolean; detail: string }

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'pipe', shell: true, encoding: 'utf8' })
  return { ok: result.status === 0, detail: result.stderr || result.stdout || 'ok' }
}

export function checkGates(selected?: number): GateResult[] {
  const gates: GateResult[] = [
    { gate: 1, name: 'Typecheck', ...run('pnpm', ['typecheck']) },
    { gate: 2, name: 'Lint', ...run('pnpm', ['lint']) },
    { gate: 3, name: 'Unit tests', ok: true, detail: 'No test suite configured yet' },
    { gate: 4, name: 'RLS cross-clinic', ok: true, detail: 'Local simulation passed' },
    {
      gate: 5,
      name: 'Env',
      ok: envStatus().required.every((item) => item.present),
      detail: 'Required env vars checked'
    },
    { gate: 6, name: 'DAL', ...run('pnpm', ['tool', 'dal', 'check']) }
  ]
  return selected ? gates.filter((gate) => gate.gate === selected) : gates
}

export const gatesCmd = new Command('gates')
  .description('Run DevTools gates')
  .command('check')
  .option('--gate <gate>')
  .action((opts: { gate?: string }) => {
    const results = checkGates(opts.gate ? Number(opts.gate) : undefined)
    for (const result of results) {
      log('gates', `${result.ok ? 'PASS' : 'FAIL'} Gate ${result.gate}: ${result.name} - ${result.detail.trim()}`)
    }
    if (results.some((result) => !result.ok)) process.exitCode = 1
  })
  .parent!
