import { Command } from 'commander'
import { readJson, writeJson } from '../lib/json-store.js'
import { loadConfig } from '../lib/config.js'
import { log } from '../lib/logger.js'
import { closeDiscordClient } from '../../../discord/src/bot.js'
import { notifyCostAlert } from '../../../discord/src/notifications/cost-alert.js'

type CostEntry = { provider: string; input: number; output: number; tokens: number; minutes: number; usd: number; createdAt: string }

function entries() {
  return readJson<CostEntry[]>('cost.json', [])
}

export const costCmd = new Command('cost').description('Track API cost')

costCmd.command('log')
  .requiredOption('--provider <provider>')
  .option('--input <input>', 'Input tokens', '0')
  .option('--output <output>', 'Output tokens', '0')
  .option('--tokens <tokens>', 'Total tokens', '0')
  .option('--minutes <minutes>', 'Audio minutes', '0')
  .action(async (opts: { provider: string; input: string; output: string; tokens: string; minutes: string }) => {
    loadConfig()
    const entry: CostEntry = {
      provider: opts.provider,
      input: Number(opts.input),
      output: Number(opts.output),
      tokens: Number(opts.tokens),
      minutes: Number(opts.minutes),
      usd: (Number(opts.input) + Number(opts.output) + Number(opts.tokens)) / 1_000_000,
      createdAt: new Date().toISOString()
    }
    const data = [...entries(), entry]
    writeJson('cost.json', data)
    const today = new Date().toISOString().split('T')[0]
    const todaySpend = data.filter((item) => item.createdAt.startsWith(today)).reduce((sum, item) => sum + item.usd, 0)
    const threshold = Number(process.env.COST_ALERT_THRESHOLD_USD || '10')
    log('cost', `Logged ${entry.provider} cost $${entry.usd.toFixed(4)}`)
    if (todaySpend > threshold) {
      log('cost', `Daily spend $${todaySpend.toFixed(2)} exceeded threshold $${threshold}`, 'warn')
      try {
        await notifyCostAlert(todaySpend, threshold)
      } finally {
        await closeDiscordClient()
      }
    }
  })

costCmd.command('today').action(() => {
  const today = new Date().toISOString().split('T')[0]
  console.table(entries().filter((entry) => entry.createdAt.startsWith(today)))
})
costCmd.command('summary').action(() => {
  const totals = entries().reduce<Record<string, number>>((acc, entry) => {
    acc[entry.provider] = (acc[entry.provider] || 0) + entry.usd
    return acc
  }, {})
  console.table(Object.entries(totals).map(([provider, usd]) => ({ provider, usd: usd.toFixed(4) })))
})
