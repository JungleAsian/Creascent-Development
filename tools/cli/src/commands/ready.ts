import { Command } from 'commander'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from '../lib/config.js'
import { log } from '../lib/logger.js'
import { envFile, promptsDir, toolsRoot } from '../lib/paths.js'
import { readJson, writeJson } from '../lib/json-store.js'
import { phaseDefinitions, phaseFileName } from '../lib/phases.js'
import { closeDiscordClient, sendNotification } from '../../../discord/src/bot.js'

type ReadySeverity = 'pass' | 'warning' | 'critical'
type ReadyCheck = { name: string; status: ReadySeverity; message: string; fix?: string }
type ReadyCategory = { id: string; label: string; checks: ReadyCheck[] }
type ReadyResult = {
  createdAt: string
  ready: boolean
  summary: { pass: number; warning: number; critical: number }
  categories: ReadyCategory[]
}

function command(args: string[], cwd = toolsRoot) {
  const result = spawnSync(args[0], args.slice(1), { cwd, encoding: 'utf8', shell: true, stdio: 'pipe' })
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() }
}

function commandExists(name: string) {
  return command([name, '--version']).ok
}

function envPresent(name: string) {
  return Boolean(process.env[name])
}

function checkPromptUsable(id: string) {
  const promptFile = path.join(promptsDir, phaseFileName(id))
  const contextFile = path.join(promptsDir, `${id}-CONTEXT.md`)
  const promptText = fs.existsSync(promptFile) ? fs.readFileSync(promptFile, 'utf8') : ''
  const contextText = fs.existsSync(contextFile) ? fs.readFileSync(contextFile, 'utf8') : ''
  const placeholder = /Paste the full|No prompt content found|record P\d+ to Notion/i
  const promptReady = promptText.trim().length >= 1000 && !placeholder.test(promptText)
  const contextReady = contextText.trim().length >= 1000 && /===\s+P\d+\s+BUILD INSTRUCTIONS\s+===/i.test(contextText) && !placeholder.test(contextText)
  return promptReady || contextReady
}

function readBacklogCount() {
  const backlog = readJson<Array<{ id: number }>>('backlog.json', [])
  return backlog.length
}

function readAgentBackend() {
  const agents = readJson<Array<{ role: string; service: string; enabled: boolean }>>('agents.json', [])
  return agents.find((agent) => agent.role === 'backend-builder' && agent.enabled)?.service ?? ''
}

function nodeCheck(): ReadyCheck {
  const result = command(['node', '--version'])
  const major = Number(result.output.match(/v(\d+)/)?.[1] ?? 0)
  return major >= 20
    ? { name: 'Node 20+', status: 'pass', message: result.output }
    : { name: 'Node 20+', status: 'critical', message: result.output || 'Node is not available.', fix: 'Install Node.js 20 LTS.' }
}

async function notionReachable(): Promise<ReadyCheck> {
  if (!process.env.NOTION_API_KEY) return { name: 'Notion reachable', status: 'critical', message: 'Notion API key is missing.', fix: 'Add NOTION_API_KEY in Settings.' }
  try {
    const response = await fetch('https://api.notion.com/v1/users?page_size=1', {
      headers: { Authorization: `Bearer ${process.env.NOTION_API_KEY}`, 'Notion-Version': '2022-06-28' }
    })
    return response.ok
      ? { name: 'Notion reachable', status: 'pass', message: `HTTP ${response.status}` }
      : { name: 'Notion reachable', status: 'critical', message: `HTTP ${response.status}`, fix: 'Check that the Notion integration token is valid.' }
  } catch (error) {
    return { name: 'Notion reachable', status: 'critical', message: String(error), fix: 'Check internet access and the Notion token.' }
  }
}

function claudeHandoffCheck(): ReadyCheck {
  return {
    name: 'Claude.ai handoff',
    status: 'warning',
    message: 'Frontend phases P09 and P11 use Claude.ai manual handoff; no Claude Code command or Anthropic API key is required for development.',
    fix: 'When those phases open, paste the prompt into Claude.ai, apply the output, then click Output Copied to Repo.'
  }
}

function backendBuilderCheck(): ReadyCheck {
  const service = readAgentBackend()
  if (!service) return { name: 'Backend builder', status: 'warning', message: 'No enabled backend builder found; Codex Pro remains the manual backend builder.' }
  return service === 'codex-pro'
    ? { name: 'Backend builder', status: 'pass', message: 'Backend builder is Codex Pro.' }
    : { name: 'Backend builder', status: 'warning', message: `Backend builder is ${service}; expected Codex Pro for the current workflow.` }
}

function summarize(categories: ReadyCategory[]) {
  const checks = categories.flatMap((category) => category.checks)
  return {
    pass: checks.filter((check) => check.status === 'pass').length,
    warning: checks.filter((check) => check.status === 'warning').length,
    critical: checks.filter((check) => check.status === 'critical').length
  }
}

async function buildReadyResult(): Promise<ReadyResult> {
  loadConfig()
  const promptReadyCount = phaseDefinitions.filter((phase) => checkPromptUsable(phase.id)).length
  const typecheck = command(['pnpm', 'typecheck'])
  const lint = command(['pnpm', 'lint'])
  const help = command(['pnpm', 'tool', '--help'])
  const commandCount = ['setup', 'backlog', 'migrate', 'rls', 'codegen', 'dal', 'route', 'seed', 'env', 'webhook', 'gates', 'phase', 'cost', 'pr', 'license', 'deploy', 'discord', 'diagnose', 'agents', 'accept', 'stack', 'ready'].filter((name) => help.output.includes(name)).length
  const dashboardPackage = fs.existsSync(path.join(toolsRoot, 'dashboard', 'package.json'))
  const gitRemote = command(['git', 'remote', 'get-url', 'origin'], path.resolve(toolsRoot, '..'))
  const gitPushAccess = command(['git', 'ls-remote', '--heads', 'origin'], path.resolve(toolsRoot, '..'))
  const categories: ReadyCategory[] = [
    {
      id: 'core',
      label: 'DevTools Core',
      checks: [
        { name: 'pnpm', status: commandExists('pnpm') ? 'pass' : 'critical', message: commandExists('pnpm') ? 'pnpm is available.' : 'pnpm is missing.', fix: 'Install pnpm.' },
        nodeCheck(),
        { name: 'Typecheck', status: typecheck.ok ? 'pass' : 'critical', message: typecheck.ok ? 'Typecheck passed.' : 'Typecheck failed.', fix: 'Run pnpm typecheck and fix errors.' },
        { name: 'Lint', status: lint.ok ? 'pass' : 'critical', message: lint.ok ? 'Lint passed.' : 'Lint failed.', fix: 'Run pnpm lint and fix errors.' },
        { name: 'CLI commands', status: commandCount >= 22 ? 'pass' : 'critical', message: `${commandCount}/22 commands found.`, fix: 'Register missing CLI commands in cli/src/index.ts.' },
        { name: 'Dashboard package', status: dashboardPackage ? 'pass' : 'critical', message: dashboardPackage ? 'Dashboard package found.' : 'Dashboard package is missing.', fix: 'Restore tools/dashboard/package.json.' }
      ]
    },
    {
      id: 'notion',
      label: 'Notion Integration',
      checks: [
        { name: 'Notion API key', status: envPresent('NOTION_API_KEY') ? 'pass' : 'critical', message: envPresent('NOTION_API_KEY') ? 'NOTION_API_KEY is set.' : 'NOTION_API_KEY is missing.', fix: 'Add NOTION_API_KEY in Settings.' },
        await notionReachable(),
        { name: 'Phase Prompts DB', status: envPresent('NOTION_PROMPTS_DB_ID') ? 'pass' : 'critical', message: envPresent('NOTION_PROMPTS_DB_ID') ? 'Phase Prompts DB is configured.' : 'NOTION_PROMPTS_DB_ID is missing.', fix: 'Run pnpm tool setup --notion.' },
        { name: 'Build Control DB', status: envPresent('NOTION_BUILD_CONTROL_DB_ID') ? 'pass' : 'critical', message: envPresent('NOTION_BUILD_CONTROL_DB_ID') ? 'Build Control DB is configured.' : 'NOTION_BUILD_CONTROL_DB_ID is missing.', fix: 'Run pnpm tool setup --notion.' },
        { name: '19 phase prompts', status: promptReadyCount === 19 ? 'pass' : 'critical', message: `${promptReadyCount}/19 prompts or assembled contexts are usable.`, fix: 'Run pnpm tool phase sync --force, then pnpm tool phase context --all.' }
      ]
    },
    {
      id: 'agents',
      label: 'AI Agents',
      checks: [
        { name: 'Anthropic API key', status: envPresent('ANTHROPIC_API_KEY') ? 'pass' : 'warning', message: envPresent('ANTHROPIC_API_KEY') ? 'ANTHROPIC_API_KEY is set.' : 'ANTHROPIC_API_KEY is not set; this is only needed when the first live clinic/runtime bot goes online.', fix: 'Leave blank during development unless you are testing the live Claude API bot.' },
        { name: 'Anthropic API configured', status: envPresent('ANTHROPIC_API_KEY') ? 'pass' : 'warning', message: envPresent('ANTHROPIC_API_KEY') ? 'Anthropic API is available for runtime testing.' : 'Development can proceed with Claude Max / Claude.ai manual handoff without an API key.', fix: 'Add ANTHROPIC_API_KEY later for live runtime API testing.' },
        claudeHandoffCheck(),
        backendBuilderCheck()
      ]
    },
    {
      id: 'git',
      label: 'Git and GitHub',
      checks: [
        { name: 'Git', status: commandExists('git') ? 'pass' : 'critical', message: commandExists('git') ? 'Git is available.' : 'Git is missing.', fix: 'Install Git for Windows.' },
        { name: 'Git user.name', status: command(['git', 'config', 'user.name'], path.resolve(toolsRoot, '..')).output ? 'pass' : 'critical', message: command(['git', 'config', 'user.name'], path.resolve(toolsRoot, '..')).output || 'Git user.name is missing.', fix: 'Set git config user.name.' },
        { name: 'Git user.email', status: command(['git', 'config', 'user.email'], path.resolve(toolsRoot, '..')).output ? 'pass' : 'critical', message: command(['git', 'config', 'user.email'], path.resolve(toolsRoot, '..')).output || 'Git user.email is missing.', fix: 'Set git config user.email.' },
        { name: 'GitHub remote', status: gitRemote.ok && gitRemote.output ? 'pass' : 'critical', message: gitRemote.output || 'Git origin remote is missing.', fix: 'Set the GitHub origin remote.' },
        { name: 'GitHub push access', status: gitPushAccess.ok ? 'pass' : 'critical', message: gitPushAccess.ok ? 'GitHub remote is reachable.' : 'GitHub remote is not reachable.', fix: 'Check SSH key/GitHub access.' }
      ]
    },
    {
      id: 'pipeline',
      label: 'Build Pipeline',
      checks: [
        { name: 'CLAUDE.md', status: fs.existsSync(path.resolve(toolsRoot, '..', 'CLAUDE.md')) ? 'pass' : 'critical', message: fs.existsSync(path.resolve(toolsRoot, '..', 'CLAUDE.md')) ? 'CLAUDE.md found.' : 'CLAUDE.md is missing.', fix: 'Place CLAUDE.md at the monorepo root.' },
        { name: 'Build script', status: fs.existsSync(path.resolve(toolsRoot, '..', 'run-docmee-build.ps1')) ? 'pass' : 'warning', message: fs.existsSync(path.resolve(toolsRoot, '..', 'run-docmee-build.ps1')) ? 'Build script found.' : 'Build script not found; /build-control can still start builds.' },
        { name: 'No placeholder prompts', status: promptReadyCount === 19 ? 'pass' : 'critical', message: promptReadyCount === 19 ? 'No placeholder ready prompts detected.' : 'Some phase prompts still need usable content.', fix: 'Sync prompts and prepare contexts.' },
        { name: 'Backlog', status: readBacklogCount() >= 45 ? 'pass' : 'warning', message: `${readBacklogCount()} backlog tasks found.`, fix: 'Run pnpm tool setup --reset to reseed backlog.' },
        { name: 'Discord', status: envPresent('DISCORD_MESSAGING_BOT_TOKEN') && envPresent('DISCORD_UPDATE_CHANNEL_ID') ? 'pass' : 'warning', message: envPresent('DISCORD_MESSAGING_BOT_TOKEN') ? 'Discord messaging is configured.' : 'Discord messaging is not fully configured.' }
      ]
    }
  ]
  const summary = summarize(categories)
  return { createdAt: new Date().toISOString(), ready: summary.critical === 0, summary, categories }
}

function printResult(result: ReadyResult) {
  if (result.ready) {
    log('ready', `DEVTOOLS READY - ${result.summary.pass} checks passed${result.summary.warning ? `, ${result.summary.warning} warnings` : ''}`)
    log('ready', 'Open http://localhost:4000/build-control and click Start Automated Build')
  } else {
    log('ready', `NOT READY - ${result.summary.critical} critical issues, ${result.summary.warning} warnings`, 'error')
    for (const check of result.categories.flatMap((category) => category.checks).filter((item) => item.status === 'critical')) {
      log('ready', `${check.name}: ${check.message}${check.fix ? ` Fix: ${check.fix}` : ''}`, 'error')
    }
  }
}

async function runReady(opts: { fix?: boolean; json?: boolean; watch?: boolean }) {
  if (opts.fix) {
    if (!fs.existsSync(envFile)) command(['pnpm', 'tool', 'setup'])
    command(['pnpm', 'tool', 'phase', 'sync', '--force'])
    command(['pnpm', 'tool', 'phase', 'context', '--all'])
  }
  let keepWatching = true
  while (keepWatching) {
    const result = await buildReadyResult()
    writeJson('ready.json', result)
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      printResult(result)
      await sendNotification(result.ready ? 'DevTools Ready - start automated build from /build-control.' : `DevTools NOT Ready - ${result.summary.critical} critical issue(s).`, result.ready ? 'development' : 'critical')
      await closeDiscordClient()
    }
    process.exitCode = result.ready ? 0 : 1
    keepWatching = Boolean(opts.watch && !result.ready)
    if (!keepWatching) return
    await new Promise((resolve) => setTimeout(resolve, 30_000))
  }
}

export const readyCmd = new Command('ready')
  .description('Run the final DevTools readiness gate')
  .option('--fix', 'Attempt local setup fixes before checking')
  .option('--json', 'Print JSON output')
  .option('--watch', 'Re-run every 30 seconds until ready')
  .action(runReady)
