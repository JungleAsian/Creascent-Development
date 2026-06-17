import { Command } from 'commander'
import { spawn, spawnSync } from 'node:child_process'
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
  const result = spawnSync('ssh', ['-i', process.env.VPS_SSH_KEY_PATH ?? '', target, ...args], {
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

function localIp() {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const item of interfaces ?? []) {
      if (item.family === 'IPv4' && !item.internal) return item.address
    }
  }
  return '127.0.0.1'
}

function pnpmCommand() {
  if (process.platform !== 'win32') return 'pnpm'
  const localAppData = process.env.LOCALAPPDATA
  const pnpmExe = localAppData ? path.join(localAppData, 'pnpm', 'pnpm.exe') : ''
  return pnpmExe && fs.existsSync(pnpmExe) ? pnpmExe : 'pnpm.exe'
}

async function printQr(url: string) {
  try {
    const qr = await import('qrcode-terminal')
    qr.default.generate(url, { small: true })
  } catch {
    log('deploy', 'QR package is not installed yet. Run pnpm install in tools.', 'warn')
  }
}

export const deployCmd = new Command('deploy').description('Deploy locally or to Hostinger VPS')

deployCmd.command('web')
  .option('--qr', 'Print QR code')
  .option('--stop', 'Stop the remembered web process')
  .action(async (opts: { qr?: boolean; stop?: boolean }) => {
    const pidFile = path.join(logsDir, 'web-dev.pid')
    if (opts.stop) {
      if (!fs.existsSync(pidFile)) {
        log('deploy', 'No remembered web dashboard process was found.', 'warn')
        return
      }
      const pid = Number(fs.readFileSync(pidFile, 'utf8').trim())
      try {
        process.kill(pid)
        fs.rmSync(pidFile, { force: true })
        log('deploy', `Stopped web dashboard process ${pid}`)
      } catch {
        log('deploy', `Unable to stop process ${pid}. It may already be closed.`, 'warn')
      }
      return
    }

    const url = `http://${localIp()}:4000`
    const running = spawnSync('powershell', ['-NoProfile', '-Command', 'Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty LocalPort'], {
      encoding: 'utf8',
      shell: false,
      stdio: 'pipe'
    })
    if (!running.stdout.trim()) {
      const child = spawn(pnpmCommand(), ['--dir', 'dashboard', 'dev'], {
        cwd: toolsRoot,
        shell: false,
        stdio: 'ignore',
        detached: true,
        windowsHide: true
      })
      child.unref()
      fs.mkdirSync(logsDir, { recursive: true })
      fs.writeFileSync(pidFile, `${child.pid ?? ''}\n`)
      log('deploy', `Started dashboard process ${child.pid}`)
    }
    fs.mkdirSync(logsDir, { recursive: true })
    log('deploy', `Local URL: http://localhost:4000`)
    log('deploy', `Network URL: ${url}`)
    log('deploy', 'Internal use only. Do not expose this dashboard to the internet.')
    if (opts.qr) await printQr(url)
  })

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
  log('deploy', 'Local deploy plan: start Redis/Supabase, build services, run API/workers/frontend locally. Product apps are not touched by DevTools until P01 starts.')
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
