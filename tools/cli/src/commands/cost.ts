import { Command } from 'commander'
import { readJson, writeJson } from '../lib/json-store.js'
import { loadConfig } from '../lib/config.js'
import { log } from '../lib/logger.js'
import { closeDiscordClient } from '../../../discord/src/bot.js'
import { notifyCostAlert } from '../../../discord/src/notifications/cost-alert.js'

type CostEntry = { provider: string; input: number; output: number; tokens: number; minutes: number; usd: number; createdAt: string }
type DevCostEntry = {
  id: string
  timestamp: string
  phase: string
  feature: string
  tool: string
  model: string
  session_minutes: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  cost_usd: number
  capture_method: 'auto' | 'manual' | 'estimated'
  notes: string
}
type CostStore = { runtime: CostEntry[]; development: DevCostEntry[] }

const pricing: Record<string, { input: number; output: number; cached?: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15, cached: 0.3 },
  'claude-opus-4-6': { input: 15, output: 75, cached: 1.5 },
  o3: { input: 10, output: 40 },
  'o4-mini': { input: 1.1, output: 4.4 },
  'gpt-4o': { input: 5, output: 15 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'deepseek-chat': { input: 0.27, output: 1.1 },
  'deepseek-coder': { input: 0.27, output: 1.1 }
}

function store(): CostStore {
  const data = readJson<CostEntry[] | CostStore>('cost.json', [])
  if (Array.isArray(data)) return { runtime: data, development: [] }
  return { runtime: data.runtime ?? [], development: data.development ?? [] }
}

function saveStore(data: CostStore) {
  writeJson('cost.json', data)
}

function entries() {
  return store().runtime
}

function developmentEntries() {
  return store().development
}

function estimateCost(model: string, input: number, output: number, cached: number) {
  const rates = pricing[model] ?? pricing['o4-mini']
  return ((input * rates.input) + (output * rates.output) + (cached * (rates.cached ?? rates.input))) / 1_000_000
}

function devSummary(entries: DevCostEntry[], groupBy: 'phase' | 'tool' | 'feature' = 'tool') {
  return entries.reduce<Record<string, { sessions: number; minutes: number; usd: number; input: number; output: number; cached: number }>>((acc, entry) => {
    const key = entry[groupBy] || 'unknown'
    acc[key] ??= { sessions: 0, minutes: 0, usd: 0, input: 0, output: 0, cached: 0 }
    acc[key].sessions += 1
    acc[key].minutes += entry.session_minutes
    acc[key].usd += entry.cost_usd
    acc[key].input += entry.input_tokens
    acc[key].output += entry.output_tokens
    acc[key].cached += entry.cached_tokens
    return acc
  }, {})
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
    const data = store()
    data.runtime = [...data.runtime, entry]
    saveStore(data)
    const today = new Date().toISOString().split('T')[0]
    const todaySpend = data.runtime.filter((item) => item.createdAt.startsWith(today)).reduce((sum, item) => sum + item.usd, 0)
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
  const developmentTotal = developmentEntries().reduce((sum, entry) => sum + entry.cost_usd, 0)
  console.table(Object.entries(totals).map(([provider, usd]) => ({ type: 'runtime', provider, usd: usd.toFixed(4) })))
  console.log(`Development total: $${developmentTotal.toFixed(4)}`)
})

const devCmd = costCmd.command('dev').description('Track one-time development build cost')

devCmd.command('log')
  .requiredOption('--phase <phase>')
  .requiredOption('--feature <feature>')
  .requiredOption('--tool <tool>')
  .option('--model <model>', 'Model name', 'o4-mini')
  .option('--input <input>', 'Input tokens', '0')
  .option('--output <output>', 'Output tokens', '0')
  .option('--cached <cached>', 'Cached tokens', '0')
  .option('--minutes <minutes>', 'Session minutes', '0')
  .option('--method <method>', 'Capture method', 'manual')
  .option('--notes <notes>', 'Notes', '')
  .action((opts: { phase: string; feature: string; tool: string; model: string; input: string; output: string; cached: string; minutes: string; method: 'auto' | 'manual' | 'estimated'; notes: string }) => {
    const input = Number(opts.input)
    const output = Number(opts.output)
    const cached = Number(opts.cached)
    const entry: DevCostEntry = {
      id: `dev-${Date.now()}`,
      timestamp: new Date().toISOString(),
      phase: opts.phase,
      feature: opts.feature,
      tool: opts.tool,
      model: opts.model,
      session_minutes: Number(opts.minutes),
      input_tokens: input,
      output_tokens: output,
      cached_tokens: cached,
      cost_usd: estimateCost(opts.model, input, output, cached),
      capture_method: opts.method,
      notes: opts.notes
    }
    const data = store()
    data.development = [...data.development, entry]
    saveStore(data)
    log('cost', `Logged development session ${entry.phase}/${entry.feature} $${entry.cost_usd.toFixed(4)}`)
  })

devCmd.command('summary')
  .option('--phase <phase>')
  .option('--tool <tool>')
  .option('--by <by>', 'Group by phase, tool, or feature', 'tool')
  .action((opts: { phase?: string; tool?: string; by: 'phase' | 'tool' | 'feature' }) => {
    const filtered = developmentEntries()
      .filter((entry) => !opts.phase || entry.phase === opts.phase)
      .filter((entry) => !opts.tool || entry.tool === opts.tool)
    console.table(Object.entries(devSummary(filtered, opts.by)).map(([group, value]) => ({
      group,
      sessions: value.sessions,
      minutes: value.minutes,
      input: value.input,
      output: value.output,
      cached: value.cached,
      usd: value.usd.toFixed(4)
    })))
  })

devCmd.command('projection').action(() => {
  const entries = developmentEntries()
  const phases = new Set(entries.map((entry) => entry.phase))
  const total = entries.reduce((sum, entry) => sum + entry.cost_usd, 0)
  const avg = phases.size > 0 ? total / phases.size : 0
  console.table([{ phases: `${phases.size}/19`, cost_to_date: total.toFixed(4), avg_phase: avg.toFixed(4), projected_total: (avg * 19).toFixed(4) }])
})
