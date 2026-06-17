import { Command } from 'commander'
import crypto from 'node:crypto'
import { loadConfig } from '../lib/config.js'
import { readJson, writeJson } from '../lib/json-store.js'
import { log } from '../lib/logger.js'

type DevLicense = { clinic: string; seats: number; expiresAt: string; key: string }

function sign(payload: string) {
  loadConfig()
  return crypto.createHmac('sha256', process.env.DEV_LICENSE_SIGNING_KEY || 'dev-secret').update(payload).digest('hex')
}

function licenses() {
  return readJson<DevLicense[]>('dev-licenses.json', [])
}

export const licenseCmd = new Command('license').description('Manage dev licenses')

licenseCmd.command('generate')
  .requiredOption('--clinic <clinic>')
  .requiredOption('--seats <seats>')
  .requiredOption('--days <days>')
  .action((opts: { clinic: string; seats: string; days: string }) => {
    const expiresAt = new Date(Date.now() + Number(opts.days) * 24 * 60 * 60 * 1000).toISOString()
    const payload = `${opts.clinic}:${opts.seats}:${expiresAt}`
    const license: DevLicense = { clinic: opts.clinic, seats: Number(opts.seats), expiresAt, key: `${Buffer.from(payload).toString('base64url')}.${sign(payload)}` }
    writeJson('dev-licenses.json', [...licenses(), license])
    log('license', `Generated license for ${license.clinic}: ${license.key}`)
  })

licenseCmd.command('list').action(() => console.table(licenses()))
licenseCmd.command('verify').requiredOption('--key <key>').action((opts: { key: string }) => {
  const found = licenses().find((license) => license.key === opts.key)
  if (!found) {
    log('license', 'License key not found', 'error')
    process.exitCode = 1
    return
  }
  log('license', `License valid for ${found.clinic} until ${found.expiresAt}`)
})
