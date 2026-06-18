import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'

const toolsRoot = path.resolve(process.cwd(), '..')
const logsRoot = path.join(toolsRoot, 'logs')

type DevCostEntry = {
  phase?: string
  input_tokens?: number
  output_tokens?: number
  cached_tokens?: number
  cost_usd?: number
}
type CostStore = { development?: DevCostEntry[] } | DevCostEntry[]
type PhaseState = { id: string; status?: string }
type BuildRun = { phase?: string; status?: string; message?: string; heartbeatAt?: string }

function readJson<T>(file: string, fallback: T): T {
  const target = path.join(logsRoot, file)
  if (!fs.existsSync(target)) return fallback
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8')) as T
  } catch {
    return fallback
  }
}

function developmentEntries() {
  const store = readJson<CostStore>('cost.json', { development: [] })
  if (Array.isArray(store)) return [] as DevCostEntry[]
  return store.development ?? []
}

export function GET() {
  const development = developmentEntries()
  const phases = readJson<PhaseState[]>('phases.json', [])
  const run = readJson<BuildRun>('build-run.json', {})
  const totalCost = development.reduce((total, entry) => total + Number(entry.cost_usd ?? 0), 0)
  const totalTokens = development.reduce((total, entry) => {
    return total + Number(entry.input_tokens ?? 0) + Number(entry.output_tokens ?? 0) + Number(entry.cached_tokens ?? 0)
  }, 0)
  const done = phases.filter((phase) => phase.status === 'done').length
  const total = phases.length || 19
  const currentPhase = run.phase || phases.find((phase) => phase.status === 'in-progress')?.id || phases.find((phase) => phase.status !== 'done')?.id || 'P01'

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    totalCost,
    totalTokens,
    phase: {
      current: currentPhase,
      done,
      total,
      status: run.status ?? phases.find((item) => item.id === currentPhase)?.status ?? 'unknown',
      message: run.message ?? ''
    }
  })
}
