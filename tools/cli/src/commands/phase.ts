import { Command } from 'commander'
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { Client } from '@notionhq/client'
import { readJson, writeJson } from '../lib/json-store.js'
import { checkGates } from './gates.js'
import { loadConfig } from '../lib/config.js'
import { log } from '../lib/logger.js'
import { promptsDir } from '../lib/paths.js'
import { defaultPhaseState, phaseDefinitions, phaseFileName, type PhaseState } from '../lib/phases.js'
import { closeDiscordClient, sendNotification } from '../../../discord/src/bot.js'
import { notifyPhaseComplete } from '../../../discord/src/notifications/phase-complete.js'

function phases() {
  const current = readJson<PhaseState[]>('phases.json', defaultPhaseState())
  const byId = new Map(current.map((phase) => [phase.id, phase]))
  return phaseDefinitions.map((definition) => byId.get(definition.id) ?? { id: definition.id, status: 'not-started' as const })
}

function save(phasesState: PhaseState[]) {
  writeJson('phases.json', phasesState)
}

function promptPath(id: string) {
  return path.join(promptsDir, phaseFileName(id))
}

function promptTextFromBlocks(blocks: Array<{ type: string; [key: string]: unknown }>) {
  const lines: string[] = []
  for (const block of blocks) {
    const value = block[block.type] as { rich_text?: Array<{ plain_text?: string }> } | undefined
    const text = value?.rich_text?.map((item) => item.plain_text ?? '').join('').trim()
    if (text) lines.push(text)
  }
  return `${lines.join('\n\n')}\n`
}

async function fetchPromptMarkdown(notion: Client, pageId: string, title: string) {
  const blocks = await notion.blocks.children.list({ block_id: pageId, page_size: 100 })
  const body = promptTextFromBlocks(blocks.results as Array<{ type: string; [key: string]: unknown }>)
  return `# ${title}\n\n${body || '_No prompt content found in Notion yet._\n'}`
}

async function syncPrompts(opts: { phase?: string; dryRun?: boolean; force?: boolean; init?: boolean }) {
  loadConfig()
  if (opts.init) {
    log('phase', 'Phase Prompts page already exists in Notion; set NOTION_PROMPTS_DB_ID to its page ID.')
    return
  }
  const selected = phaseDefinitions.filter((phase) => {
    if (opts.phase && phase.id !== opts.phase) return false
    return opts.force || phase.promptStatus === 'ready' || phase.promptStatus === 'locked'
  })
  if (!process.env.NOTION_API_KEY) {
    log('phase', 'NOTION_API_KEY is missing; using cached prompt files only.', 'warn')
    for (const phase of selected) {
      const exists = fs.existsSync(promptPath(phase.id))
      log('phase', `${phase.id} ${exists ? 'cached' : 'missing'} - ${phase.name}`, exists ? 'info' : 'warn')
    }
    return
  }
  const notion = new Client({ auth: process.env.NOTION_API_KEY })
  for (const phase of selected) {
    const file = promptPath(phase.id)
    log('phase', `${opts.dryRun ? 'Would sync' : 'Syncing'} ${phase.id} from Notion`)
    if (opts.dryRun) continue
    fs.mkdirSync(promptsDir, { recursive: true })
    const markdown = await fetchPromptMarkdown(notion, phase.notionPageId, `${phase.id} - ${phase.name}`)
    fs.writeFileSync(file, markdown)
    log('phase', `Synced ${phase.id} to ${file}`)
  }
}

function buildPlan(from?: string) {
  const start = from ? phaseDefinitions.findIndex((phase) => phase.id === from) : 0
  if (start < 0) throw new Error(`Unknown phase ${from}`)
  return phaseDefinitions.slice(start)
}

async function runBuild(opts: { from?: string; dryRun?: boolean; noSync?: boolean }) {
  if (!opts.noSync) await syncPrompts({ force: false, dryRun: opts.dryRun })
  const plan = buildPlan(opts.from)
  for (const phase of plan) {
    const file = promptPath(phase.id)
    const cached = fs.existsSync(file)
    log('phase', `${opts.dryRun ? 'Plan' : 'Build'} ${phase.id} ${phase.name} (${phase.builder}) ${cached ? file : 'prompt missing'}`)
    if (opts.dryRun) continue
    if (!cached) {
      log('phase', `Cannot build ${phase.id}; prompt file is missing. Sync from Notion or mark prompt ready.`, 'error')
      process.exitCode = 1
      return
    }
    if (phase.builder === 'codex') {
      if (process.platform === 'win32') {
        const editor = spawn('notepad.exe', [file], { detached: true, stdio: 'ignore' })
        editor.unref()
      }
      log('phase', `${phase.id} opened for Codex Pro. Paste into Codex, apply changes, then rerun or continue manually.`)
      return
    }
    const claude = spawnSync('claude', [file], { shell: true, stdio: 'inherit' })
    if (claude.status !== 0) {
      await sendNotification(`Claude Code phase ${phase.id} failed. Fix and retry.`, 'critical')
      process.exitCode = 1
      return
    }
    const gates = checkGates()
    if (gates.some((gate) => !gate.ok)) {
      await sendNotification(`${phase.id} gates failed after build.`, 'critical')
      process.exitCode = 1
      return
    }
    const state = phases()
    const current = state.find((item) => item.id === phase.id)
    if (current) {
      current.status = 'done'
      current.completedAt = new Date().toISOString()
      save(state)
    }
    await notifyPhaseComplete(phase.id, phase.name)
    if (phase.id === 'P11') {
      await sendNotification('Submit to Meta for WhatsApp approval now. Do not wait for P19.', 'critical')
    }
  }
  await closeDiscordClient()
}

export const phaseCmd = new Command('phase').description('Manage phase status')

phaseCmd.command('list').action(() => {
  const state = phases()
  const byId = new Map(state.map((phase) => [phase.id, phase]))
  console.table(phaseDefinitions.map((phase) => ({
    id: phase.id,
    name: phase.name,
    builder: phase.builder,
    business: phase.businessPhase,
    prompt: phase.promptStatus,
    status: byId.get(phase.id)?.status ?? 'not-started'
  })))
})

phaseCmd.command('start').argument('<phase>').action((id: string) => {
  const state = phases()
  const phase = state.find((item) => item.id === id)
  if (!phase) throw new Error(`Unknown phase ${id}`)
  phase.status = 'in-progress'
  phase.startedAt = new Date().toISOString()
  save(state)
  log('phase', `Started ${id}`)
})

phaseCmd.command('done').argument('<phase>').action(async (id: string) => {
  const results = checkGates()
  if (results.some((result) => !result.ok)) {
    log('phase', `Cannot mark ${id} done; gates failed`, 'error')
    process.exitCode = 1
    return
  }
  const state = phases()
  const phase = state.find((item) => item.id === id)
  const definition = phaseDefinitions.find((item) => item.id === id)
  if (!phase || !definition) throw new Error(`Unknown phase ${id}`)
  phase.status = 'done'
  phase.completedAt = new Date().toISOString()
  save(state)
  log('phase', `Completed ${id}`)
  try {
    await notifyPhaseComplete(id, definition.name)
  } finally {
    await closeDiscordClient()
  }
})

phaseCmd.command('sync')
  .option('--phase <phase>')
  .option('--dry-run')
  .option('--force')
  .option('--init')
  .action(syncPrompts)

phaseCmd.command('build')
  .option('--from <phase>')
  .option('--dry-run')
  .option('--no-sync')
  .action(runBuild)
