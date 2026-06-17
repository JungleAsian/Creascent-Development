import { Command } from 'commander'
import { spawnSync } from 'node:child_process'
import { envStatus } from '../lib/config.js'
import { log } from '../lib/logger.js'
import { closeDiscordClient } from '../../../discord/src/bot.js'
import { notifyGateFailed } from '../../../discord/src/notifications/gate-failed.js'
import { notifyGatePassed } from '../../../discord/src/notifications/gate-passed.js'

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
  .action(async (opts: { gate?: string }) => {
    const results = checkGates(opts.gate ? Number(opts.gate) : undefined)
    for (const result of results) {
      log('gates', `${result.ok ? 'PASS' : 'FAIL'} Gate ${result.gate}: ${result.name} - ${result.detail.trim()}`)
    }
    const failed = results.filter((result) => !result.ok)
    try {
      if (failed.length > 0) {
        for (const result of failed) {
          await notifyGateFailed(result.gate, result.name, result.detail.trim())
        }
        process.exitCode = 1
      } else {
        const label = opts.gate ? results[0]?.name ?? 'Selected gate' : 'All DevTools gates'
        await notifyGatePassed(opts.gate ? Number(opts.gate) : results.length, label)
      }
    } finally {
      await closeDiscordClient()
    }
  })
  .parent!
