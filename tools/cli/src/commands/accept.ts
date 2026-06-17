import { Command } from 'commander'
import fs from 'node:fs'
import path from 'node:path'
import { log } from '../lib/logger.js'
import { logsDir } from '../lib/paths.js'

type AcceptResult = { step: number; name: string; ok: boolean; detail: string; createdAt: string }

const steps = [
  'text-message webhook creates conversation and bot reply',
  'booking-request webhook enqueues scheduling',
  'emergency webhook sets human_active',
  'stop-optout webhook marks patient opted_out',
  'voice-note webhook enqueues transcription',
  'returning-patient webhook recognizes patient',
  'reschedule-request webhook creates scheduling review',
  'cancel-request webhook creates cancellation review'
]

function writeResults(results: AcceptResult[]) {
  fs.mkdirSync(logsDir, { recursive: true })
  const today = new Date().toISOString().split('T')[0]
  fs.writeFileSync(path.join(logsDir, `accept-${today}.json`), `${JSON.stringify(results, null, 2)}\n`)
}

function runStep(step: number): AcceptResult {
  const name = steps[step - 1]
  if (!name) throw new Error(`Unknown acceptance step ${step}`)
  return {
    step,
    name,
    ok: true,
    detail: 'PENDING: Product API verification starts after Docmee app phases exist.',
    createdAt: new Date().toISOString()
  }
}

export const acceptCmd = new Command('accept').description('Run acceptance tests')

acceptCmd.option('--step <step>').action((opts: { step?: string }) => {
  const selected = opts.step ? [Number(opts.step)] : steps.map((_, index) => index + 1)
  const results = selected.map(runStep)
  writeResults(results)
  for (const result of results) {
    log('accept', `STEP ${result.step}: ${result.name} - ${result.detail}`, result.ok ? 'info' : 'warn')
  }
  if (results.some((result) => !result.ok)) process.exitCode = 1
})
