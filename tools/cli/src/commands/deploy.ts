import { Command } from 'commander'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadConfig } from '../lib/config.js'
import { log } from '../lib/logger.js'
import { deployDir, logsDir, toolsRoot } from '../lib/paths.js'
import { sendNotification, closeDiscordClient } from '../../../discord/src/bot.js'

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
  recordLock('vps')
  log('deploy', 'VPS deploy plan: git push, SSH git pull, pnpm install, pnpm build, migrations, PM2 reload, health check.')
  await sendNotification('VPS deployment requested. Confirm settings before running production deployment.', 'critical')
  await closeDiscordClient()
})

deployCmd.command('local').action(() => {
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
