import fs from 'node:fs'
import dotenv from 'dotenv'
import { envExampleFile, envFile } from './paths.js'

export const requiredEnvVars = [
  'TOOLS_DB_URL',
  'TOOLS_DB_SERVICE_KEY',
  'MONOREPO_ROOT',
  'NEXT_PUBLIC_DASHBOARD_PORT',
  'WEBHOOK_TARGET',
  'DEV_LICENSE_SIGNING_KEY'
]

export const optionalEnvVars = [
  'DISCORD_BOT_TOKEN',
  'DISCORD_CHANNEL_ID',
  'GATES_STRICT',
  'COST_ALERT_THRESHOLD_USD'
]

export function loadConfig() {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile })
  } else if (fs.existsSync(envExampleFile)) {
    dotenv.config({ path: envExampleFile })
  }
  return process.env
}

export function envStatus() {
  loadConfig()
  return {
    required: requiredEnvVars.map((name) => ({ name, present: Boolean(process.env[name]) })),
    optional: optionalEnvVars.map((name) => ({ name, present: Boolean(process.env[name]) }))
  }
}
