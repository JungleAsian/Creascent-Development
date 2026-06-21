import { Command } from 'commander'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadConfig } from '../lib/config.js'
import { log } from '../lib/logger.js'
import { deployDir, logsDir, toolsRoot } from '../lib/paths.js'
import { sendNotification, closeDiscordClient } from '../../../discord/src/bot.js'
import { switchMode, verifyMode, activeUrls, rollback as tunnelRollback, type TunnelDeps } from '../../../sentinel/tunnel/index.js'
import { loadConfig as loadSentinelConfig, updateLocalConfig } from '../../../sentinel/config/index.js'
import type { TunnelMode } from '../../../sentinel/config/schema.js'

const tunnelDeps: TunnelDeps = {
  getConfig: () => loadSentinelConfig().config,
  updateConfig: (patch) => updateLocalConfig(patch).config,
  onTargetsChanged: () => undefined, // running daemon picks up the config change via fs.watch
  audit: () => undefined
}

function requireVpsConfig() {
  loadConfig()
  const missing = ['VPS_HOST', 'VPS_USER', 'VPS_SSH_KEY_PATH', 'VPS_DEPLOY_PATH'].filter((name) => !process.env[name])
  if (missing.length > 0) {
    log('deploy', `Missing VPS settings: ${missing.join(', ')}`, 'warn')
    return false
  }
  return true
}

function ssh(args: string[]) {
  if (!requireVpsConfig()) return { ok: false, output: 'VPS settings missing' }
  const target = `${process.env.VPS_USER}@${process.env.VPS_HOST}`
  const result = spawnSync('ssh', ['-i', keyPath(), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', target, ...args], {
    encoding: 'utf8',
    shell: true,
    stdio: 'pipe'
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return { ok: result.status === 0, output }
}

function recordLock(action: string) {
  fs.mkdirSync(logsDir, { recursive: true })
  fs.writeFileSync(path.join(logsDir, 'deploy-lock.json'), `${JSON.stringify({ action, createdAt: new Date().toISOString() }, null, 2)}\n`)
}

function keyPath() {
  return (process.env.VPS_SSH_KEY_PATH || '~/.ssh/id_ed25519').replace(/^~/, os.homedir())
}

export const deployCmd = new Command('deploy').description('Deploy locally or to Hostinger VPS')

deployCmd.command('redis').action(() => {
  log('deploy', 'Install Redis 7 from the official Redis repository; do not use the Ubuntu apt default Redis 6 package.')
  console.log('sudo install -m 0755 -d /etc/apt/keyrings')
  console.log('curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/redis-archive-keyring.gpg')
  console.log('echo "deb [signed-by=/etc/apt/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/redis.list')
  console.log('sudo apt-get update && sudo apt-get install redis -y')
})

deployCmd.command('check').action(() => {
  const result = ssh(['"node -v; pnpm -v; pm2 -v; caddy version; redis-cli ping; ufw status"'])
  log('deploy', result.ok ? 'VPS check completed' : `VPS check failed: ${result.output}`, result.ok ? 'info' : 'warn')
})

deployCmd.command('keygen').action(() => {
  loadConfig()
  const privateKey = keyPath()
  const publicKey = `${privateKey}.pub`
  if (!fs.existsSync(privateKey)) {
    fs.mkdirSync(path.dirname(privateKey), { recursive: true })
    const result = spawnSync('ssh-keygen', ['-t', 'ed25519', '-f', privateKey, '-N', '', '-C', 'docmee-devtools'], { encoding: 'utf8', stdio: 'pipe' })
    if (result.status !== 0) {
      log('deploy', `SSH key generation failed: ${result.stderr || result.stdout}`, 'error')
      process.exitCode = 1
      return
    }
  }
  log('deploy', `SSH private key: ${privateKey}`)
  if (fs.existsSync(publicKey)) console.log(fs.readFileSync(publicKey, 'utf8').trim())
})

deployCmd.command('setup').action(() => {
  const script = path.join(deployDir, 'setup', 'vps-setup.sh')
  log('deploy', `Run one-time VPS setup with ${script}. Review it before copying to production.`)
})

deployCmd.command('env').action(() => {
  loadConfig()
  const envPath = process.env.ENV_PRODUCTION_PATH || '.env.production'
  if (!fs.existsSync(path.resolve(toolsRoot, '..', envPath)) && !fs.existsSync(path.resolve(toolsRoot, envPath))) {
    log('deploy', `${envPath} not found; nothing was synced.`, 'warn')
    return
  }
  log('deploy', `${envPath} is ready to sync via SCP after VPS settings are confirmed.`)
})

deployCmd.command('vps').action(async () => {
  if (!requireVpsConfig()) {
    process.exitCode = 1
    return
  }
  recordLock('vps')
  const branch = process.env.GITHUB_BRANCH || 'main'
  const deployPath = process.env.VPS_DEPLOY_PATH as string
  const ecosystem = process.env.PM2_ECOSYSTEM_FILE || 'ecosystem.config.cjs'
  // Build product apps in dependency order (db first). Overridable for unusual setups.
  const buildCmd = process.env.VPS_BUILD_CMD
    || 'pnpm install --frozen-lockfile && pnpm --filter @docmee/db --filter @docmee/api --filter @docmee/workers --filter @docmee/inboxos build'
  const migrateCmd = process.env.VPS_MIGRATE_CMD || 'pnpm --filter @docmee/db db:migrate'

  // 1) Push the current HEAD to the deploy branch the VPS pulls from.
  log('deploy', `Pushing HEAD to origin/${branch}...`)
  const push = spawnSync('git', ['push', 'origin', `HEAD:${branch}`], {
    cwd: path.resolve(toolsRoot, '..'),
    encoding: 'utf8',
    stdio: 'pipe'
  })
  if (push.status !== 0) {
    log('deploy', `git push failed: ${(push.stderr || push.stdout || '').trim()}`, 'error')
    await sendNotification('VPS deploy aborted: git push failed.', 'critical')
    await closeDiscordClient()
    process.exitCode = 1
    return
  }

  // Repo URL the VPS clones from on first deploy (the VPS needs its own GitHub
  // auth — a deploy key/token — for a private repo).
  const repoUrl = process.env.DEPLOY_REPO_URL
    || (spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: path.resolve(toolsRoot, '..'), encoding: 'utf8' }).stdout || '').trim()

  // 2) On the VPS: bootstrap the clone if missing, then sync to the pushed
  // commit, install, build, migrate, and reload PM2.
  const remote = [
    `mkdir -p $(dirname ${deployPath})`,
    `if [ ! -d ${deployPath}/.git ]; then git clone ${repoUrl} ${deployPath}; fi`,
    `cd ${deployPath}`,
    'git fetch --all --prune',
    `git reset --hard origin/${branch}`,
    buildCmd,
    migrateCmd,
    `pm2 startOrReload ${ecosystem} --update-env`,
    'pm2 save'
  ].join(' && ')
  log('deploy', 'Running remote deploy (sync, install, build, migrate, PM2 reload)...')
  const remoteResult = ssh([`"${remote}"`])
  if (remoteResult.output) log('deploy', remoteResult.output)
  if (!remoteResult.ok) {
    log('deploy', 'Remote deploy step failed. The VPS may be in a partial state — review the output above.', 'error')
    await sendNotification('VPS deploy failed during the remote build/reload step.', 'critical')
    await closeDiscordClient()
    process.exitCode = 1
    return
  }

  // 3) Health check the API.
  const host = process.env.VPS_DOMAIN || process.env.VPS_HOST
  const apiPort = process.env.API_PORT || '3001'
  const healthUrl = `http://${host}:${apiPort}/health`
  let healthy = false
  try {
    const response = await fetch(healthUrl)
    healthy = response.ok
    log('deploy', `Health ${healthUrl}: HTTP ${response.status}`, response.ok ? 'info' : 'warn')
  } catch (error) {
    log('deploy', `Health check ${healthUrl} failed: ${String(error)}`, 'warn')
  }
  if (!healthy) process.exitCode = 1
  await sendNotification(
    healthy
      ? `VPS deploy succeeded (branch ${branch}). API health OK.`
      : `VPS deploy ran but the API health check did not pass — verify the VPS.`,
    healthy ? 'development' : 'critical'
  )
  await closeDiscordClient()
})

deployCmd
  .command('local')
  .option('--no-browser', 'Do not open a browser (used by the Playwright webServer)')
  .action(() => {
    const compose = path.resolve(toolsRoot, '..', 'docker-compose.yml')
    if (fs.existsSync(compose)) spawnSync('docker', ['compose', 'up', '-d'], { cwd: path.dirname(compose), stdio: 'inherit', shell: true })
    log('deploy', 'Local deploy requested. Product app processes start after Docmee app phases create /apps.')
  })

deployCmd.command('health').option('--target <target>', 'local or vps', 'local').action(async (opts: { target: string }) => {
  loadConfig()
  const host = opts.target === 'vps' ? process.env.VPS_DOMAIN || process.env.VPS_HOST || 'localhost' : 'localhost'
  const url = `http://${host}:3001/health`
  try {
    const response = await fetch(url)
    log('deploy', `Health ${url}: HTTP ${response.status}`, response.ok ? 'info' : 'warn')
    if (!response.ok) process.exitCode = 1
  } catch (error) {
    log('deploy', `Health ${url} failed: ${String(error)}`, 'warn')
    process.exitCode = 1
  }
})

deployCmd.command('status').action(() => {
  const result = ssh(['"pm2 status; redis-cli ping; df -h; free -h"'])
  log('deploy', result.ok ? 'VPS status completed' : `VPS status failed: ${result.output}`, result.ok ? 'info' : 'warn')
})

deployCmd.command('logs').option('--service <service>', 'Service name', 'all').action((opts: { service: string }) => {
  const service = opts.service === 'all' ? '' : opts.service
  const result = ssh([`"pm2 logs ${service} --lines 100 --nostream"`])
  log('deploy', result.ok ? 'VPS logs fetched' : `VPS logs failed: ${result.output}`, result.ok ? 'info' : 'warn')
})

deployCmd.command('restart').requiredOption('--service <service>').action((opts: { service: string }) => {
  const result = ssh([`"pm2 reload ${opts.service}"`])
  log('deploy', result.ok ? `Restarted ${opts.service}` : `Restart failed: ${result.output}`, result.ok ? 'info' : 'warn')
})

deployCmd.command('rollback').action(async () => {
  recordLock('rollback')
  log('deploy', 'Rollback plan: SSH checkout previous commit, rebuild, PM2 reload, health check.')
  await sendNotification('Rollback requested. Confirm target commit before production rollback.', 'critical')
  await closeDiscordClient()
})

deployCmd.command('migrate').action(() => {
  const result = ssh(['"pnpm tool migrate run"'])
  log('deploy', result.ok ? 'Remote migrations completed' : `Remote migration failed: ${result.output}`, result.ok ? 'info' : 'warn')
})

// --- Tunnel Switcher (Sentinel owns the config; DevTools mirrors it) ---
const tunnelCmd = new Command('tunnel').description('Tunnel Switcher — None / ngrok / Cloudflare / Permanent')

tunnelCmd.command('status').description('Show active mode and all URLs').action(() => {
  const config = loadSentinelConfig().config
  const urls = activeUrls(config)
  log('deploy', `Tunnel mode: ${config.tunnel.activeMode} (verified ${config.tunnel.lastVerified ?? 'never'})`)
  log('deploy', `App:      ${urls.appUrl || '—'}`)
  log('deploy', `API:      ${urls.apiUrl || '—'}`)
  log('deploy', `DevTools: ${urls.devtoolsUrl || '—'}`)
  log('deploy', `Webhook:  ${urls.webhookUrl || '—'}`)
})

tunnelCmd.command('verify').description('Run a health check on the active mode without switching').action(async () => {
  const config = loadSentinelConfig().config
  const result = await verifyMode(config, config.tunnel.activeMode)
  for (const c of result.checks) log('deploy', `${c.ok ? 'OK ' : 'FAIL'} ${c.label}: ${c.detail}`, c.ok ? 'info' : 'warn')
  log('deploy', result.ok ? 'Tunnel verify passed.' : 'Tunnel verify failed.', result.ok ? 'info' : 'warn')
})

tunnelCmd
  .command('switch')
  .argument('<mode>', 'none | ngrok | cloudflare | permanent')
  .description('Switch tunnel mode (verifies first for all modes except none)')
  .action(async (mode: string) => {
    const modes: TunnelMode[] = ['none', 'ngrok', 'cloudflare', 'permanent']
    if (!modes.includes(mode as TunnelMode)) return log('deploy', `Invalid mode: ${mode}`, 'warn')
    const result = await switchMode(tunnelDeps, mode as TunnelMode)
    if (!result.ok) {
      for (const c of result.verify.checks) if (!c.ok) log('deploy', `FAIL ${c.label}: ${c.detail}`, 'warn')
      return log('deploy', `Switch blocked: ${result.blocked}`, 'warn')
    }
    log('deploy', `Switched to ${result.mode}. .env.tools updated.`)
    if (result.webhookChanged) log('deploy', `⚠️ WhatsApp webhook changed → ${result.urls.webhookUrl}. Update it in the Meta dashboard.`, 'warn')
  })

tunnelCmd.command('webhook').description('Print the current WhatsApp webhook URL').action(() => {
  log('deploy', activeUrls(loadSentinelConfig().config).webhookUrl || '— (no external mode active)')
})

tunnelCmd.command('rollback').description('Roll back to the previous tunnel mode').action(async () => {
  const result = await tunnelRollback(tunnelDeps)
  log('deploy', result.ok ? `Rolled back to ${result.mode}.` : `Rollback blocked: ${result.blocked}`, result.ok ? 'info' : 'warn')
})

deployCmd.addCommand(tunnelCmd)
