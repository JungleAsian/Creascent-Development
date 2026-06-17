import { Command } from 'commander'
import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { envFile, logsDir, promptsDir, toolsRoot } from '../lib/paths.js'
import { loadConfig, requiredEnvVars } from '../lib/config.js'
import { writeJson } from '../lib/json-store.js'
import { log } from '../lib/logger.js'

type Severity = 'pass' | 'info' | 'warning' | 'critical'
type Check = { name: string; status: Severity; message: string; fix?: string; fixable?: boolean }
type Category = { id: string; label: string; checks: Check[] }
type DiagnoseRun = { createdAt: string; quick: boolean; categories: Category[]; summary: { pass: number; warning: number; critical: number; info: number } }

function commandOk(command: string) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8', shell: true, stdio: 'pipe' })
  return result.status === 0
}

function envPresent(name: string) {
  return Boolean(process.env[name])
}

function checkFile(file: string) {
  return fs.existsSync(file)
}

function localIp() {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const item of interfaces ?? []) {
      if (item.family === 'IPv4' && !item.internal) return item.address
    }
  }
  return '127.0.0.1'
}

function firewallCheck(): Check {
  if (process.platform !== 'win32') return { name: 'Firewall rule', status: 'info', message: 'Firewall check is Windows-specific.' }
  try {
    const output = execSync('powershell -NoProfile -Command "Get-NetFirewallRule -DisplayName \\"Docmee DevTools (port 4000)\\" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Enabled"', { encoding: 'utf8' })
    return output.trim() ? { name: 'Firewall rule', status: 'pass', message: 'Port 4000 firewall rule exists.' } : { name: 'Firewall rule', status: 'warning', message: 'Port 4000 firewall rule was not found.', fix: 'Run the firewall rule command from the Web Access Notion page as Administrator.' }
  } catch {
    return { name: 'Firewall rule', status: 'warning', message: 'Unable to inspect Windows Firewall.', fix: 'Open Windows Defender Firewall and allow inbound TCP 4000 for private networks.' }
  }
}

function buildCategories(quick: boolean): Category[] {
  loadConfig()
  const monorepoRoot = path.resolve(toolsRoot, process.env.MONOREPO_ROOT || '..')
  const promptFiles = fs.existsSync(promptsDir) ? fs.readdirSync(promptsDir).filter((name) => name.endsWith('.md')) : []
  const categories: Category[] = [
    {
      id: 'windows',
      label: 'Windows Environment',
      checks: [
        { name: 'Node.js', status: commandOk('node') ? 'pass' : 'critical', message: commandOk('node') ? 'Node is available.' : 'Node is not available.', fix: 'Install Node.js 20 LTS.' },
        { name: 'pnpm', status: commandOk('pnpm') ? 'pass' : 'critical', message: commandOk('pnpm') ? 'pnpm is available.' : 'pnpm is not available.', fix: 'Install pnpm, then reopen the desktop tool.' },
        { name: 'Git', status: commandOk('git') ? 'pass' : 'critical', message: commandOk('git') ? 'Git is available.' : 'Git is not available.', fix: 'Install Git for Windows.' },
        { name: 'LAN IP', status: localIp() === '127.0.0.1' ? 'warning' : 'pass', message: `Network URL is http://${localIp()}:4000.` },
        firewallCheck()
      ]
    },
    {
      id: 'devtools',
      label: 'DevTools Configuration',
      checks: [
        { name: '.env.tools', status: checkFile(envFile) ? 'pass' : 'critical', message: checkFile(envFile) ? '.env.tools exists.' : '.env.tools is missing.', fix: 'Open Settings and create .env.tools.' },
        ...requiredEnvVars.map((name) => ({ name, status: envPresent(name) ? 'pass' as const : 'critical' as const, message: envPresent(name) ? `${name} is set.` : `${name} is missing.`, fix: `Fill ${name} in Settings.` })),
        { name: 'Monorepo root', status: checkFile(monorepoRoot) ? 'pass' : 'warning', message: `${monorepoRoot}` },
        { name: 'Prompt cache', status: promptFiles.length > 0 ? 'pass' : 'warning', message: `${promptFiles.length} prompt files cached.`, fix: 'Run pnpm tool phase sync.' }
      ]
    },
    {
      id: 'notion',
      label: 'Notion Integration',
      checks: [
        { name: 'Notion API key', status: envPresent('NOTION_API_KEY') ? 'pass' : 'critical', message: envPresent('NOTION_API_KEY') ? 'Notion API key is set.' : 'Notion API key is missing.', fix: 'Create a Notion integration and add NOTION_API_KEY.' },
        { name: 'Phase prompts page', status: envPresent('NOTION_PROMPTS_DB_ID') ? 'pass' : 'critical', message: envPresent('NOTION_PROMPTS_DB_ID') ? 'Phase prompt page ID is set.' : 'Phase prompt page ID is missing.', fix: 'Set NOTION_PROMPTS_DB_ID to the Phase Prompts page ID.' },
        { name: 'Synced prompts', status: promptFiles.length >= 3 ? 'pass' : 'warning', message: `${promptFiles.length} prompt files found.`, fix: 'Run pnpm tool phase sync --force.' }
      ]
    },
    {
      id: 'discord',
      label: 'Discord',
      checks: [
        { name: 'Messaging bot token', status: envPresent('DISCORD_MESSAGING_BOT_TOKEN') ? 'pass' : 'warning', message: envPresent('DISCORD_MESSAGING_BOT_TOKEN') ? 'Messaging bot token is set.' : 'Messaging bot token is missing.' },
        { name: 'Critical channel', status: envPresent('DISCORD_CRITICAL_CHANNEL_ID') ? 'pass' : 'warning', message: envPresent('DISCORD_CRITICAL_CHANNEL_ID') ? 'Critical channel is set.' : 'Critical channel is missing.' },
        { name: 'Development channel', status: envPresent('DISCORD_UPDATE_CHANNEL_ID') ? 'pass' : 'warning', message: envPresent('DISCORD_UPDATE_CHANNEL_ID') ? 'Development update channel is set.' : 'Development update channel is missing.' },
        { name: 'Approval channel', status: envPresent('DISCORD_APPROVAL_CHANNEL_ID') ? 'pass' : 'warning', message: envPresent('DISCORD_APPROVAL_CHANNEL_ID') ? 'Approval channel is set.' : 'Approval channel is missing.' }
      ]
    },
    {
      id: 'build-readiness',
      label: 'Build Readiness',
      checks: [
        { name: 'CLAUDE.md', status: checkFile(path.join(monorepoRoot, 'CLAUDE.md')) ? 'pass' : 'warning', message: 'Root CLAUDE.md check completed.', fix: 'Place CLAUDE.md at the monorepo root before P01.' },
        { name: 'Dashboard package', status: checkFile(path.join(toolsRoot, 'dashboard', 'package.json')) ? 'pass' : 'critical', message: 'Dashboard package found.' },
        { name: 'CLI package', status: checkFile(path.join(toolsRoot, 'cli', 'src', 'index.ts')) ? 'pass' : 'critical', message: 'CLI entrypoint found.' }
      ]
    }
  ]

  if (!quick) {
    categories.splice(2, 0,
      {
        id: 'local-supabase',
        label: 'Local Supabase',
        checks: [
          { name: 'Supabase CLI', status: commandOk('supabase') ? 'pass' : 'warning', message: commandOk('supabase') ? 'Supabase CLI is available.' : 'Supabase CLI is not available.' },
          { name: 'Local URL', status: envPresent('SUPABASE_URL') ? 'pass' : 'warning', message: envPresent('SUPABASE_URL') ? 'SUPABASE_URL is set.' : 'SUPABASE_URL is missing.' }
        ]
      },
      {
        id: 'redis',
        label: 'Redis (Local)',
        checks: [
          { name: 'Redis URL', status: envPresent('REDIS_URL') ? 'pass' : 'warning', message: envPresent('REDIS_URL') ? 'REDIS_URL is set.' : 'REDIS_URL is missing.' },
          { name: 'Docker', status: commandOk('docker') ? 'pass' : 'warning', message: commandOk('docker') ? 'Docker is available.' : 'Docker is not available.' }
        ]
      },
      {
        id: 'ai-providers',
        label: 'AI Providers',
        checks: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENAI_EMBEDDING_KEY', 'DEEPSEEK_API_KEY', 'DEEPGRAM_API_KEY'].map((name) => ({
          name,
          status: envPresent(name) ? 'pass' as const : 'warning' as const,
          message: envPresent(name) ? `${name} is set.` : `${name} is missing.`
        }))
      },
      {
        id: 'whatsapp-meta',
        label: 'WhatsApp / Meta',
        checks: ['META_APP_SECRET', 'META_VERIFY_TOKEN', 'WHATSAPP_DEFAULT_ACCESS_TOKEN', 'WEBHOOK_TARGET'].map((name) => ({
          name,
          status: envPresent(name) ? 'pass' as const : 'warning' as const,
          message: envPresent(name) ? `${name} is set.` : `${name} is missing.`
        }))
      },
      {
        id: 'vps',
        label: 'Hostinger VPS',
        checks: ['VPS_HOST', 'VPS_USER', 'VPS_SSH_KEY_PATH', 'VPS_DEPLOY_PATH', 'VPS_DOMAIN'].map((name) => ({
          name,
          status: envPresent(name) ? 'pass' as const : 'warning' as const,
          message: envPresent(name) ? `${name} is set.` : `${name} is missing.`
        }))
      }
    )
  }

  return categories
}

function summarize(categories: Category[]) {
  const checks = categories.flatMap((category) => category.checks)
  return {
    pass: checks.filter((check) => check.status === 'pass').length,
    warning: checks.filter((check) => check.status === 'warning').length,
    critical: checks.filter((check) => check.status === 'critical').length,
    info: checks.filter((check) => check.status === 'info').length
  }
}

function run(options: { quick?: boolean; category?: string; fix?: boolean }) {
  let categories = buildCategories(Boolean(options.quick))
  if (options.category) categories = categories.filter((category) => category.id === options.category)
  const runData: DiagnoseRun = { createdAt: new Date().toISOString(), quick: Boolean(options.quick), categories, summary: summarize(categories) }
  fs.mkdirSync(logsDir, { recursive: true })
  writeJson('diagnostics.json', runData)
  const historyFile = path.join(logsDir, 'diagnostics-history.json')
  const history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, 'utf8')) as DiagnoseRun[] : []
  writeJson('diagnostics-history.json', [runData, ...history].slice(0, 5))
  for (const category of categories) {
    const passed = category.checks.filter((check) => check.status === 'pass').length
    const worst = category.checks.some((check) => check.status === 'critical') ? 'critical' : category.checks.some((check) => check.status === 'warning') ? 'warning' : 'pass'
    log('diagnose', `${category.label}: ${passed}/${category.checks.length} ${worst}`)
  }
  log('diagnose', `Summary: ${runData.summary.critical} critical, ${runData.summary.warning} warnings, ${runData.summary.pass} passed`)
  if (options.fix) log('diagnose', 'Auto-fix currently reports fix instructions only; no system changes were made.')
  process.exitCode = runData.summary.critical > 0 ? 1 : 0
}

export const diagnoseCmd = new Command('diagnose').description('Run targeted Docmee DevTools diagnostics')

diagnoseCmd
  .option('--quick', 'Run critical checks only')
  .option('--category <category>', 'Run one diagnostic category')
  .option('--fix', 'Show auto-fix guidance for fixable issues')
  .action((opts: { quick?: boolean; category?: string; fix?: boolean }) => run(opts))
