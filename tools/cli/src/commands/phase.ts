import { Command } from 'commander'
import { readJson, writeJson } from '../lib/json-store.js'
import { checkGates } from './gates.js'
import { log } from '../lib/logger.js'
import { closeDiscordClient } from '../../../discord/src/bot.js'
import { notifyPhaseComplete } from '../../../discord/src/notifications/phase-complete.js'

type Phase = { id: string; status: 'not-started' | 'in-progress' | 'done' }

function phases() {
  return readJson<Phase[]>('phases.json', Array.from({ length: 10 }, (_, index) => ({ id: `P${String(index + 1).padStart(2, '0')}`, status: 'not-started' })))
}

function save(phasesState: Phase[]) {
  writeJson('phases.json', phasesState)
}

export const phaseCmd = new Command('phase').description('Manage phase status')

phaseCmd.command('list').action(() => console.table(phases()))
phaseCmd.command('start').argument('<phase>').action((id: string) => {
  const state = phases()
  const phase = state.find((item) => item.id === id)
  if (!phase) throw new Error(`Unknown phase ${id}`)
  phase.status = 'in-progress'
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
  if (!phase) throw new Error(`Unknown phase ${id}`)
  phase.status = 'done'
  save(state)
  log('phase', `Completed ${id}`)
  try {
    await notifyPhaseComplete(id, id)
  } finally {
    await closeDiscordClient()
  }
})
