import { Command } from 'commander'
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { Client } from '@notionhq/client'
import { readJson, writeJson } from '../lib/json-store.js'
import { checkGates } from './gates.js'
import { loadConfig } from '../lib/config.js'
import { log } from '../lib/logger.js'
import { envFile, promptsDir } from '../lib/paths.js'
import { defaultPhaseState, phaseDefinitions, phaseFileName, type PhaseState } from '../lib/phases.js'
import { claudeCodeCommand, claudeCodeEnvironment } from '../lib/claude-code.js'
import { touchBuildRun } from '../lib/build-run.js'
import { closeDiscordClient, sendNotification } from '../../../discord/src/bot.js'
import { notifyPhaseComplete } from '../../../discord/src/notifications/phase-complete.js'

type BuildControlStatus = 'pending' | 'awaiting-output' | 'in-progress' | 'output-copied' | 'gates-running' | 'pushing' | 'complete' | 'failed'
type BuildControlRecord = {
  phaseId: string
  status: BuildControlStatus
  updatedAt: string
  notes?: string
  commitHash?: string
}
type BacklogTask = { id: number; phase: string; priority: string; title: string; status: string }

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

function contextPath(id: string) {
  return path.join(promptsDir, `${id}-CONTEXT.md`)
}

function buildControl() {
  const fallback: BuildControlRecord[] = phaseDefinitions.map((phase) => ({
    phaseId: phase.id,
    status: 'pending' as const,
    updatedAt: new Date(0).toISOString()
  }))
  const current = readJson<BuildControlRecord[]>('build-control.json', fallback)
  const byId = new Map(current.map((record) => [record.phaseId, record]))
  return fallback.map((record) => byId.get(record.phaseId) ?? record)
}

function saveBuildControl(records: BuildControlRecord[]) {
  writeJson('build-control.json', records)
}

function setLocalBuildStatus(phaseId: string, status: BuildControlStatus, notes?: string) {
  const records = buildControl()
  const record = records.find((item) => item.phaseId === phaseId)
  if (!record) throw new Error(`Unknown phase ${phaseId}`)
  record.status = status
  record.updatedAt = new Date().toISOString()
  if (notes) record.notes = notes
  saveBuildControl(records)
  return record
}

async function setBuildStatus(phaseId: string, status: BuildControlStatus, notes?: string) {
  const record = setLocalBuildStatus(phaseId, status, notes)
  const remoteUpdated = await setNotionBuildStatus(phaseId, status, notes)
  if (remoteUpdated) log('phase', `${phaseId} Notion Build Control status updated`)
  return record
}

function updateEnvValue(name: string, value: string) {
  const line = `${name}=${value}`
  const content = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : ''
  const pattern = new RegExp(`^${name}=.*$`, 'm')
  const next = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.trimEnd()}\n${line}\n`
  fs.writeFileSync(envFile, next)
  process.env[name] = value
}

function git(args: string[]) {
  return spawnSync('git', args, { cwd: path.resolve(promptsDir, '..', '..'), encoding: 'utf8', shell: false, stdio: 'pipe' })
}

function repoRoot() {
  return path.resolve(promptsDir, '..', '..')
}

function gitOutput(args: string[]) {
  const result = git(args)
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() }
}

function shortFailure(output: string) {
  return output.replace(/\s+/g, ' ').trim().slice(0, 180) || 'Claude Code returned a failure or is not available'
}

function currentBranch() {
  const result = gitOutput(['branch', '--show-current'])
  return result.ok && result.output ? result.output : 'main'
}

async function commitAndPushPhase(id: string, name: string) {
  loadConfig()
  const status = gitOutput(['status', '--porcelain'])
  if (!status.ok) {
    await sendNotification(`${id} git status failed. Build stopped before marking phase done.`, 'critical')
    return { ok: false, commitHash: '', message: status.output }
  }
  if (!status.output) {
    const current = gitOutput(['rev-parse', '--short', 'HEAD'])
    const commitHash = current.ok ? current.output : ''
    log('phase', `No changes to commit for ${id}; using current commit ${commitHash || 'unknown'}`)
    return { ok: true, commitHash, message: 'No changes to commit' }
  }
  const add = gitOutput(['add', '.'])
  if (!add.ok) {
    await sendNotification(`${id} git add failed. Build stopped before marking phase done.`, 'critical')
    return { ok: false, commitHash: '', message: add.output }
  }
  const commit = gitOutput(['commit', '-m', `build(${id}): ${name} - gates passed`])
  if (!commit.ok) {
    await sendNotification(`${id} git commit failed. Build stopped before marking phase done.`, 'critical')
    return { ok: false, commitHash: '', message: commit.output }
  }
  const hash = gitOutput(['rev-parse', '--short', 'HEAD'])
  const branch = process.env.GITHUB_BRANCH || currentBranch()
  const push = gitOutput(['push', 'origin', `HEAD:${branch}`])
  if (!push.ok) {
    await sendNotification(`${id} git push failed for origin ${branch}. Build stopped before marking phase done.`, 'critical')
    return { ok: false, commitHash: hash.output, message: push.output }
  }
  await sendNotification(`${id} pushed to GitHub - commit ${hash.output}`, 'development')
  return { ok: true, commitHash: hash.output, message: 'Committed and pushed' }
}

function fileReadiness(file: string) {
  if (!fs.existsSync(file)) return { ok: false, reason: 'prompt file is missing' }
  const text = fs.readFileSync(file, 'utf8')
  const placeholder = text.includes('Paste the full') || text.includes('No prompt content found') || text.includes('record P01 to Notion') || text.includes('record P02 to Notion')
  if (placeholder) return { ok: false, reason: 'prompt is still a placeholder in Notion' }
  if (text.trim().length < 1000) return { ok: false, reason: 'prompt is too short to be a build prompt' }
  return { ok: true, reason: 'ready' }
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

async function fetchPageText(notion: Client, pageId: string, title: string) {
  const blocks = await notion.blocks.children.list({ block_id: pageId, page_size: 100 })
  const body = promptTextFromBlocks(blocks.results as Array<{ type: string; [key: string]: unknown }>)
  return `# ${title}\n\n${body}`.trim()
}

function extractContextPageIds(markdown: string) {
  const marker = markdown.match(/##\s+CONTEXT PAGES([\s\S]*)/i)
  if (!marker) return []
  const ids = new Set<string>()
  for (const match of marker[1].matchAll(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)) {
    ids.add(match[0].replaceAll('-', ''))
  }
  return [...ids]
}

function backlogGaps(phaseId: string) {
  const tasks = readJson<BacklogTask[]>('backlog.json', [])
  return tasks
    .filter((task) => task.status !== 'done' && (task.phase === phaseId || task.phase === 'P00'))
    .map((task) => `- Gap #${task.id}: ${task.title} (${task.priority})`)
}

async function assemblePhaseContext(phaseId: string, opts: { preview?: boolean } = {}) {
  loadConfig()
  const phase = phaseDefinitions.find((item) => item.id === phaseId)
  if (!phase) throw new Error(`Unknown phase ${phaseId}`)
  fs.mkdirSync(promptsDir, { recursive: true })

  let architecture = ''
  let prompt = ''
  const sources: string[] = []
  const promptFile = promptPath(phaseId)

  if (process.env.NOTION_API_KEY) {
    const notion = new Client({ auth: process.env.NOTION_API_KEY })
    try {
      if (process.env.NOTION_CLAUDE_MD_PAGE_ID) {
        architecture = await fetchPageText(notion, process.env.NOTION_CLAUDE_MD_PAGE_ID, 'CLAUDE.md')
        sources.push(`CLAUDE.md (${architecture.length} chars)`)
      }
      prompt = await fetchPromptMarkdown(notion, phase.notionPageId, `${phase.id} - ${phase.name}`)
      sources.push(`${phase.id} prompt (${prompt.length} chars)`)
      for (const pageId of extractContextPageIds(prompt)) {
        if (pageId === process.env.NOTION_CLAUDE_MD_PAGE_ID?.replaceAll('-', '')) continue
        const extra = await fetchPageText(notion, pageId, `Context ${pageId}`)
        architecture += `\n\n${extra}`
        sources.push(`context page ${pageId.slice(0, 8)} (${extra.length} chars)`)
      }
    } catch (error) {
      log('phase', `Notion context fetch failed; using cached prompt where available. ${String(error)}`, 'warn')
    }
  }

  if (!prompt && fs.existsSync(promptFile)) {
    prompt = fs.readFileSync(promptFile, 'utf8')
    sources.push(`${phase.id} cached prompt (${prompt.length} chars)`)
  }
  if (!architecture) {
    const localClaude = path.resolve(promptsDir, '..', 'CLAUDE.md')
    if (fs.existsSync(localClaude)) {
      architecture = fs.readFileSync(localClaude, 'utf8')
      sources.push(`local CLAUDE.md (${architecture.length} chars)`)
    }
  }

  const gaps = backlogGaps(phaseId)
  if (gaps.length > 0) sources.push(`backlog gaps (${gaps.length})`)
  const context = [
    `# ${phase.id} - ${phase.name} Context`,
    '=== ARCHITECTURE (CLAUDE.md) ===',
    architecture || '_No architecture context was available._',
    '---',
    `=== ${phase.id} BUILD INSTRUCTIONS ===`,
    prompt || '_No phase prompt was available._',
    '---',
    `=== KNOWN GAPS TO FIX IN ${phase.id} ===`,
    gaps.length > 0 ? gaps.join('\n') : '_No open local backlog gaps for this phase._'
  ].join('\n\n')
  const file = contextPath(phaseId)
  fs.writeFileSync(file, `${context.trim()}\n`)
  log('phase', `Context ready: ${context.length} chars from ${sources.length} sources -> ${file}`)
  if (sources.length > 0) log('phase', `Sources: ${sources.join('; ')}`)
  if (opts.preview) console.log(context)
  return { file, context, sources, promptChars: prompt.trim().length }
}

function assembledReadiness(promptChars: number, file: string) {
  const context = fileReadiness(file)
  if (!context.ok) return context
  const text = fs.readFileSync(file, 'utf8')
  const hasBuildInstructions = /===\s+P\d+\s+BUILD INSTRUCTIONS\s+===/i.test(text)
  if (promptChars < 1000 && !hasBuildInstructions) return { ok: false, reason: 'phase prompt is too short to be a build prompt' }
  return { ok: true, reason: 'ready' }
}

async function readNotionBuildStatus(phaseId: string) {
  loadConfig()
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_BUILD_CONTROL_DB_ID) return null
  const notion = new Client({ auth: process.env.NOTION_API_KEY })
  const result = await notion.databases.query({
    database_id: process.env.NOTION_BUILD_CONTROL_DB_ID,
    filter: { property: 'Phase ID', rich_text: { equals: phaseId } }
  })
  const page = result.results[0] as { properties?: Record<string, { type?: string; select?: { name?: string } }> } | undefined
  return page?.properties?.Status?.select?.name ?? null
}

async function currentBuildStatus(phaseId: string) {
  const notion = await readNotionBuildStatus(phaseId)
  return notion ?? buildControl().find((record) => record.phaseId === phaseId)?.status ?? 'pending'
}

async function setNotionBuildStatus(phaseId: string, status: BuildControlStatus, notes?: string) {
  loadConfig()
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_BUILD_CONTROL_DB_ID) return false
  const phase = phaseDefinitions.find((item) => item.id === phaseId)
  if (!phase) throw new Error(`Unknown phase ${phaseId}`)
  const notion = new Client({ auth: process.env.NOTION_API_KEY })
  const existing = await notion.databases.query({
    database_id: process.env.NOTION_BUILD_CONTROL_DB_ID,
    filter: { property: 'Phase ID', rich_text: { equals: phaseId } }
  })
  const properties = {
    'Phase Name': { title: [{ text: { content: phase.name } }] },
    'Phase ID': { rich_text: [{ text: { content: phaseId } }] },
    Builder: { select: { name: phase.builder } },
    Status: { select: { name: status } },
    Notes: { rich_text: notes ? [{ text: { content: notes } }] : [] }
  }
  const page = existing.results[0] as { id?: string } | undefined
  if (page?.id) {
    await notion.pages.update({ page_id: page.id, properties })
  } else {
    await notion.pages.create({ parent: { database_id: process.env.NOTION_BUILD_CONTROL_DB_ID }, properties })
  }
  return true
}

async function initBuildControl() {
  loadConfig()
  if (!process.env.NOTION_API_KEY) {
    log('phase', 'NOTION_API_KEY is missing; cannot create the Notion Build Control database.', 'error')
    process.exitCode = 1
    return
  }
  if (process.env.NOTION_BUILD_CONTROL_DB_ID) {
    log('phase', `Build Control database already configured: ${process.env.NOTION_BUILD_CONTROL_DB_ID}`)
    return
  }
  const parentPageId = process.env.NOTION_PROMPTS_DB_ID || process.env.NOTION_CLAUDE_MD_PAGE_ID
  if (!parentPageId) {
    log('phase', 'Set NOTION_PROMPTS_DB_ID or NOTION_CLAUDE_MD_PAGE_ID before initializing Build Control.', 'error')
    process.exitCode = 1
    return
  }
  const notion = new Client({ auth: process.env.NOTION_API_KEY })
  const database = await notion.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: 'Build Control' } }],
    properties: {
      'Phase Name': { title: {} },
      'Phase ID': { rich_text: {} },
      Builder: {
        select: {
          options: [
            { name: 'codex', color: 'blue' },
            { name: 'claude-code', color: 'purple' }
          ]
        }
      },
      Status: {
        select: {
          options: [
            { name: 'pending', color: 'gray' },
            { name: 'awaiting-output', color: 'yellow' },
            { name: 'in-progress', color: 'blue' },
            { name: 'output-copied', color: 'green' },
            { name: 'gates-running', color: 'purple' },
            { name: 'pushing', color: 'orange' },
            { name: 'complete', color: 'green' },
            { name: 'failed', color: 'red' }
          ]
        }
      },
      'Prompt Link': { url: {} },
      'Started At': { date: {} },
      'Completed At': { date: {} },
      'Commit Hash': { rich_text: {} },
      Notes: { rich_text: {} }
    }
  })
  updateEnvValue('NOTION_BUILD_CONTROL_DB_ID', database.id)
  for (const phase of phaseDefinitions) {
    await setNotionBuildStatus(phase.id, 'pending', 'Initialized by DevTools')
  }
  log('phase', `Created Build Control database: ${database.id}`)
}

async function syncPrompts(opts: { phase?: string; dryRun?: boolean; force?: boolean; init?: boolean }) {
  loadConfig()
  if (opts.init) {
    await initBuildControl()
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

function shouldSync(opts: { sync?: boolean; noSync?: boolean }) {
  return opts.sync !== false && opts.noSync !== true
}

async function runAutomatedClaudePhase(phaseId: string, name: string, file: string) {
  touchBuildRun({ phase: phaseId, status: 'running', message: `${phaseId} Claude Code build starting` })
  await setBuildStatus(phaseId, 'in-progress', 'Claude Code build started')
  const state = phases()
  const phase = state.find((item) => item.id === phaseId)
  if (phase) {
    phase.status = 'in-progress'
    phase.startedAt = new Date().toISOString()
    save(state)
  }
  await sendNotification(`${phaseId} Claude Code build started.`, 'development')
  const prompt = fs.readFileSync(file, 'utf8')
  const { status, output } = await runClaudeWithHeartbeat(phaseId, prompt)
  if (output) {
    for (const line of output.split(/\r?\n/).filter(Boolean)) log('phase', `${phaseId} Claude Code: ${line}`)
  }
  if (status !== 0) {
    const failure = shortFailure(output)
    touchBuildRun({ phase: phaseId, status: 'failed', message: `${phaseId} Claude Code failed: ${failure}` })
    await setBuildStatus(phaseId, 'failed', `Claude Code failed: ${failure}`)
    await sendNotification(`${phaseId} Claude Code failed: ${failure}. Fix Claude Code, then resume from ${phaseId}.`, 'critical')
    process.exitCode = 1
    return false
  }
  touchBuildRun({ phase: phaseId, status: 'running', message: `${phaseId} Claude Code finished; running gates` })
  await setBuildStatus(phaseId, 'gates-running', 'Running quality gates')
  const gates = checkGates()
  if (gates.some((gate) => !gate.ok)) {
    touchBuildRun({ phase: phaseId, status: 'failed', message: `${phaseId} gates failed` })
    await setBuildStatus(phaseId, 'failed', 'One or more gates failed')
    await sendNotification(`${phaseId} gates failed after Claude Code build.`, 'critical')
    process.exitCode = 1
    return false
  }
  await setBuildStatus(phaseId, 'pushing', 'Committing and pushing phase changes')
  const published = await commitAndPushPhase(phaseId, name)
  if (!published.ok) {
    touchBuildRun({ phase: phaseId, status: 'failed', message: `${phaseId} GitHub push failed` })
    await setBuildStatus(phaseId, 'failed', `GitHub push failed: ${published.message}`)
    log('phase', `Cannot complete ${phaseId}; GitHub push failed: ${published.message}`, 'error')
    process.exitCode = 1
    return false
  }
  const nextState = phases()
  const current = nextState.find((item) => item.id === phaseId)
  if (!current) throw new Error(`Unknown phase ${phaseId}`)
  current.status = 'done'
  current.completedAt = new Date().toISOString()
  current.commitHash = published.commitHash
  current.committedAt = new Date().toISOString()
  save(nextState)
  const control = await setBuildStatus(phaseId, 'complete', 'Phase committed and pushed')
  control.commitHash = published.commitHash
  saveBuildControl(buildControl().map((record) => record.phaseId === phaseId ? control : record))
  await notifyPhaseComplete(phaseId, name)
  if (phaseId === 'P11') await sendNotification('Submit to Meta for WhatsApp approval now. Do not wait for P19.', 'critical')
  touchBuildRun({ phase: phaseId, status: phaseId === 'P19' ? 'complete' : 'running', message: `${phaseId} complete${phaseId === 'P19' ? '' : '; advancing to next phase'}` })
  return true
}

function runClaudeWithHeartbeat(phaseId: string, prompt: string) {
  return new Promise<{ status: number | null; output: string }>((resolve) => {
    const child = spawn(claudeCodeCommand(), ['--print', '--dangerously-skip-permissions', '--add-dir', repoRoot()], {
      cwd: repoRoot(),
      env: claudeCodeEnvironment(),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const chunks: string[] = []
    const heartbeat = setInterval(() => {
      touchBuildRun({ phase: phaseId, status: 'running', message: `${phaseId} Claude Code is working` })
    }, 15_000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => chunks.push(String(chunk)))
    child.stderr.on('data', (chunk) => chunks.push(String(chunk)))
    child.on('error', (error) => {
      clearInterval(heartbeat)
      resolve({ status: 1, output: error.message })
    })
    child.on('close', (code) => {
      clearInterval(heartbeat)
      touchBuildRun({ phase: phaseId, status: 'running', message: `${phaseId} Claude Code process finished` })
      resolve({ status: code, output: chunks.join('').trim() })
    })
    child.stdin.end(prompt)
  })
}

async function runBuild(opts: { from?: string; dryRun?: boolean; noSync?: boolean; sync?: boolean }) {
  if (shouldSync(opts)) await syncPrompts({ force: false, dryRun: opts.dryRun })
  const plan = buildPlan(opts.from)
  for (const phase of plan) {
    const context = await assemblePhaseContext(phase.id)
    const file = context.file
    const readiness = assembledReadiness(context.promptChars, file)
    log('phase', `${opts.dryRun ? 'Plan' : 'Build'} ${phase.id} ${phase.name} (${phase.builder}) ${readiness.ok ? file : readiness.reason}`)
    if (opts.dryRun) continue
    if (!readiness.ok) {
      log('phase', `Cannot build ${phase.id}; ${readiness.reason}. Add the full prompt in Notion, then run phase sync.`, 'error')
      process.exitCode = 1
      return
    }
    const completed = await runAutomatedClaudePhase(phase.id, phase.name, file)
    if (!completed) return
  }
  await closeDiscordClient()
}

async function completePhaseAfterOutput(phaseId: string) {
  const definition = phaseDefinitions.find((item) => item.id === phaseId)
  if (!definition) throw new Error(`Unknown phase ${phaseId}`)
  await setBuildStatus(phaseId, 'gates-running', 'Running gates after output copied')
  const results = checkGates()
  if (results.some((result) => !result.ok)) {
    await setBuildStatus(phaseId, 'failed', 'One or more gates failed')
    await sendNotification(`${phaseId} gates failed after output copied.`, 'critical')
    process.exitCode = 1
    return false
  }
  await setBuildStatus(phaseId, 'pushing', 'Committing and pushing phase changes')
  const published = await commitAndPushPhase(phaseId, definition.name)
  if (!published.ok) {
    await setBuildStatus(phaseId, 'failed', `GitHub push failed: ${published.message}`)
    log('phase', `Cannot complete ${phaseId}; GitHub push failed: ${published.message}`, 'error')
    process.exitCode = 1
    return false
  }
  const state = phases()
  const phase = state.find((item) => item.id === phaseId)
  if (!phase) throw new Error(`Unknown phase ${phaseId}`)
  phase.status = 'done'
  phase.completedAt = new Date().toISOString()
  phase.commitHash = published.commitHash
  phase.committedAt = new Date().toISOString()
  save(state)
  const control = await setBuildStatus(phaseId, 'complete', 'Phase committed and pushed')
  control.commitHash = published.commitHash
  saveBuildControl(buildControl().map((record) => record.phaseId === phaseId ? control : record))
  await notifyPhaseComplete(phaseId, definition.name)
  if (phaseId === 'P11') await sendNotification('Submit to Meta for WhatsApp approval now. Do not wait for P19.', 'critical')
  return true
}

async function watchBuild(opts: { from?: string; interval?: string; maxMinutes?: string; noSync?: boolean; sync?: boolean; dryRun?: boolean }) {
  if (!opts.dryRun) touchBuildRun({ phase: opts.from ?? 'P01', status: 'starting', startedAt: new Date().toISOString(), message: 'Automated build watcher starting' })
  if (shouldSync(opts)) await syncPrompts({ force: false, dryRun: opts.dryRun })
  const plan = buildPlan(opts.from)
  for (const phase of plan) {
    if (phases().find((item) => item.id === phase.id)?.status === 'done') continue
    const context = await assemblePhaseContext(phase.id)
    const file = context.file
    const readiness = assembledReadiness(context.promptChars, file)
    log('phase', `${opts.dryRun ? 'Watch plan' : 'Watch'} ${phase.id} ${phase.name} (${phase.builder}) ${readiness.ok ? 'ready' : readiness.reason}`)
    if (opts.dryRun) continue
    if (!readiness.ok) {
      await setBuildStatus(phase.id, 'failed', readiness.reason)
      process.exitCode = 1
      return
    }
    const completed = await runAutomatedClaudePhase(phase.id, phase.name, file)
    if (!completed) return
  }
  if (!opts.dryRun) touchBuildRun({ phase: 'P19', status: 'complete', message: 'Automated build complete' })
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
  const published = await commitAndPushPhase(id, definition.name)
  if (!published.ok) {
    log('phase', `Cannot mark ${id} done; GitHub push failed: ${published.message}`, 'error')
    process.exitCode = 1
    await closeDiscordClient()
    return
  }
  phase.status = 'done'
  phase.completedAt = new Date().toISOString()
  phase.commitHash = published.commitHash
  phase.committedAt = new Date().toISOString()
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

phaseCmd.command('watch')
  .option('--from <phase>')
  .option('--interval <seconds>', 'Polling interval in seconds', '30')
  .option('--max-minutes <minutes>', 'Maximum watch time', '720')
  .option('--no-sync')
  .option('--dry-run')
  .action(watchBuild)

phaseCmd.command('continue')
  .requiredOption('--phase <phase>')
  .action(async (opts: { phase: string }) => {
    const status = await currentBuildStatus(opts.phase)
    if (status !== 'output-copied') {
      log('phase', `${opts.phase} status is ${status}; waiting for output-copied`, 'warn')
      process.exitCode = 1
      return
    }
    try {
      await completePhaseAfterOutput(opts.phase)
    } finally {
      await closeDiscordClient()
    }
  })

phaseCmd.command('context')
  .option('--phase <phase>')
  .option('--preview')
  .option('--all')
  .action(async (opts: { phase?: string; preview?: boolean; all?: boolean }) => {
    if (opts.all) {
      for (const phase of phaseDefinitions) await assemblePhaseContext(phase.id, { preview: opts.preview })
      return
    }
    if (!opts.phase) throw new Error('--phase is required unless --all is used')
    await assemblePhaseContext(opts.phase, { preview: opts.preview })
  })

phaseCmd.command('poll')
  .requiredOption('--phase <phase>')
  .requiredOption('--status <status>')
  .action(async (opts: { phase: string; status: BuildControlStatus }) => {
    const local = buildControl().find((record) => record.phaseId === opts.phase)?.status ?? 'pending'
    const notion = await readNotionBuildStatus(opts.phase)
    const actual = notion ?? local
    if (actual === opts.status) {
      log('phase', `${opts.phase} status is ${actual}`)
      return
    }
    log('phase', `${opts.phase} status is ${actual}; waiting for ${opts.status}`, 'warn')
    process.exitCode = 1
  })

phaseCmd.command('status')
  .requiredOption('--phase <phase>')
  .requiredOption('--status <status>')
  .option('--notes <notes>')
  .action(async (opts: { phase: string; status: BuildControlStatus; notes?: string }) => {
    await setBuildStatus(opts.phase, opts.status, opts.notes)
    log('phase', `${opts.phase} status set to ${opts.status}`)
  })
