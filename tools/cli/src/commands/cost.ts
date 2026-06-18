import { Command } from 'commander'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readJson, writeJson } from '../lib/json-store.js'
import { loadConfig } from '../lib/config.js'
import { log } from '../lib/logger.js'
import { closeDiscordClient } from '../../../discord/src/bot.js'
import { notifyCostAlert } from '../../../discord/src/notifications/cost-alert.js'
import { phaseDefinitions, type PhaseState } from '../lib/phases.js'
import { toolsRoot } from '../lib/paths.js'

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
type ClaudeUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}
type ClaudeLogEntry = {
  cwd?: string
  requestId?: string
  uuid?: string
  timestamp?: string
  type?: string
  message?: {
    model?: string
    usage?: ClaudeUsage
  }
}

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

function repoRoot() {
  return path.resolve(toolsRoot, '..')
}

function normalizeFilePath(value?: string) {
  return path.resolve(value ?? '').toLowerCase()
}

function claudeProjectDirs() {
  const root = path.join(os.homedir(), '.claude', 'projects')
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
}

function claudeJsonlFiles() {
  return claudeProjectDirs().flatMap((dir) => fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => path.join(dir, entry.name)))
}

function phaseForTimestamp(timestamp?: string) {
  const when = timestamp ? Date.parse(timestamp) : Number.NaN
  const state = readJson<PhaseState[]>('phases.json', [])
  if (Number.isNaN(when)) return null
  const matched = state.find((phase) => {
    if (!phase.startedAt) return false
    const started = Date.parse(phase.startedAt)
    const completed = phase.completedAt ? Date.parse(phase.completedAt) : Date.now()
    return when >= started && when <= completed
  })
  return matched?.id ?? null
}

function phaseFeature(phaseId: string) {
  const phase = phaseDefinitions.find((item) => item.id === phaseId)
  return phase ? `${phase.id}/${phase.name}` : 'Claude Code usage sync'
}

export function syncClaudeUsage() {
  const root = normalizeFilePath(repoRoot())
  const data = store()
  data.development = data.development.filter((entry) => !(entry.id.startsWith('claude-') && entry.tool === 'claude-code' && entry.capture_method === 'auto'))
  const existingIds = new Set(data.development.map((entry) => entry.id))
  const seenRequests = new Set<string>()
  const entries: DevCostEntry[] = []
  let scanned = 0
  let skipped = 0

  for (const file of claudeJsonlFiles()) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      if (!line.trim()) continue
      let item: ClaudeLogEntry
      try {
        item = JSON.parse(line) as ClaudeLogEntry
      } catch {
        skipped += 1
        continue
      }
      const usage = item.message?.usage
      const cwd = normalizeFilePath(item.cwd)
      if (!usage || !cwd.startsWith(root)) continue
      const requestId = item.requestId || item.uuid
      if (!requestId || seenRequests.has(requestId)) continue
      seenRequests.add(requestId)
      const id = `claude-${requestId}`
      if (existingIds.has(id)) continue
      const input = Number(usage.input_tokens ?? 0) + Number(usage.cache_creation_input_tokens ?? 0)
      const output = Number(usage.output_tokens ?? 0)
      const cached = Number(usage.cache_read_input_tokens ?? 0)
      if (input + output + cached <= 0) continue
      const phase = phaseForTimestamp(item.timestamp)
      if (!phase) continue
      entries.push({
        id,
        timestamp: item.timestamp ?? new Date().toISOString(),
        phase,
        feature: phaseFeature(phase),
        tool: 'claude-code',
        model: item.message?.model ?? 'claude-sonnet-4-6',
        session_minutes: 0,
        input_tokens: input,
        output_tokens: output,
        cached_tokens: cached,
        cost_usd: estimateCost(item.message?.model ?? 'claude-sonnet-4-6', input, output, cached),
        capture_method: 'auto',
        notes: `Imported from Claude Code usage log (${requestId})`
      })
      scanned += 1
    }
  }

  if (entries.length > 0) {
    data.development = [...data.development, ...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    saveStore(data)
  }
  return { imported: entries.length, scanned, skipped }
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

devCmd.command('sync-claude')
  .description('Import Claude Code usage from local Claude logs')
  .action(() => {
    const result = syncClaudeUsage()
    log('cost', `Claude usage sync imported ${result.imported} new cost entr${result.imported === 1 ? 'y' : 'ies'}`)
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
