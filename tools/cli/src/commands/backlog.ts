import { Command } from 'commander'
import { readJson, writeJson } from '../lib/json-store.js'
import { log } from '../lib/logger.js'

type Priority = 'critical' | 'high' | 'medium' | 'low' | 'infrastructure'
type Status = 'todo' | 'done'
type Task = { id: number; phase: string; priority: Priority; title: string; status: Status }

const seedTitles = [
  ['P01', 'critical', 'missing exports'],
  ['P01', 'critical', 'webhook route'],
  ['P01', 'critical', 'transcription worker'],
  ['P01', 'critical', 'notifications repo'],
  ['P01', 'critical', 'kb repo'],
  ['P01', 'critical', 'notification routes'],
  ['P01', 'critical', 'heartbeat route'],
  ['P01', 'high', 'countActive()'],
  ['P01', 'high', 'Calendar OAuth'],
  ['P01', 'high', 'encrypt naming'],
  ['P01', 'high', 'conversation/messages repos'],
  ['P01', 'high', 'tags system'],
  ['P01', 'high', 'internal notes'],
  ['P01', 'high', 'i18n toggle'],
  ['P01', 'high', 'new/returning patient'],
  ['P01', 'high', 'reschedule+cancel'],
  ['P01', 'high', 'error review'],
  ['P01', 'high', 'Meta token expiry'],
  ['P01', 'high', 'IA Studio panel'],
  ['P01', 'high', 'installer-core files'],
  ['P01', 'high', 'vitest.config and docker-compose'],
  ['P02', 'medium', 'Messenger'],
  ['P02', 'medium', 'Instagram'],
  ['P02', 'medium', 'assignment UI'],
  ['P02', 'medium', 'quick replies'],
  ['P02', 'medium', 'patient history'],
  ['P02', 'medium', 'metrics dashboard'],
  ['P02', 'medium', 'follow-up automation'],
  ['P02', 'medium', 'WhatsApp templates'],
  ['P02', 'medium', 'sentiment detection'],
  ['P02', 'medium', 'PWA'],
  ['P03', 'low', 'multi-doctor'],
  ['P03', 'low', 'document training'],
  ['P03', 'low', 'custom flows'],
  ['P03', 'low', 'Google Sheets'],
  ['P03', 'low', 'reports'],
  ['P03', 'low', 'review automation'],
  ['P03', 'low', 'mobile app'],
  ['P03', 'low', 'advanced analytics'],
  ['P00', 'infrastructure', 'integration tests'],
  ['P00', 'infrastructure', 'E2E tests'],
  ['P00', 'infrastructure', 'CI/CD pipeline'],
  ['P00', 'infrastructure', 'vitest config'],
  ['P00', 'infrastructure', 'docker-compose'],
  ['P00', 'infrastructure', 'operations runbook'],
  ['P00', 'infrastructure', 'Claude usage-limit pause and automatic resume guard'],
  ['P00', 'infrastructure', 'Build Control paused state with Claude reset countdown'],
  ['P00', 'infrastructure', 'Discord notice when Claude usage guard pauses or resumes']
] as const

export function seedBacklog() {
  const tasks = seedTitles.map(([phase, priority, title], index) => ({
    id: index + 1,
    phase,
    priority,
    title,
    status: 'todo' as const
  }))
  saveTasks(tasks)
  return tasks.length
}

function getTasks() {
  return readJson<Task[]>('backlog.json', [])
}

function saveTasks(tasks: Task[]) {
  writeJson('backlog.json', tasks)
}

export const backlogCmd = new Command('backlog')
  .description('Manage DevTools backlog')
  .command('init')
  .description('Seed 45 known gaps')
  .action(() => {
    const count = seedBacklog()
    log('backlog', `Seeded ${count} backlog tasks`)
  })
  .parent!

backlogCmd
  .command('list')
  .option('--phase <phase>')
  .option('--priority <priority>')
  .action((opts: { phase?: string; priority?: string }) => {
    const tasks = getTasks().filter((task) => {
      return (!opts.phase || task.phase === opts.phase) && (!opts.priority || task.priority === opts.priority)
    })
    console.table(tasks)
  })

backlogCmd
  .command('add')
  .requiredOption('--title <title>')
  .requiredOption('--phase <phase>')
  .requiredOption('--priority <priority>')
  .action((opts: { title: string; phase: string; priority: Priority }) => {
    const tasks = getTasks()
    const nextId = Math.max(0, ...tasks.map((task) => task.id)) + 1
    tasks.push({ id: nextId, title: opts.title, phase: opts.phase, priority: opts.priority, status: 'todo' })
    saveTasks(tasks)
    log('backlog', `Added task ${nextId}`)
  })

backlogCmd
  .command('done')
  .requiredOption('--id <id>')
  .action((opts: { id: string }) => {
    const id = Number(opts.id)
    const tasks = getTasks()
    const task = tasks.find((item) => item.id === id)
    if (!task) {
      log('backlog', `Task ${id} not found`, 'error')
      process.exitCode = 1
      return
    }
    task.status = 'done'
    saveTasks(tasks)
    log('backlog', `Marked task ${id} done`)
  })
