import fs from 'node:fs'
import path from 'node:path'

const toolsRoot = path.resolve(process.cwd(), '..')
const phasesFile = path.join(toolsRoot, 'logs', 'phases.json')
const buildControlFile = path.join(toolsRoot, 'logs', 'build-control.json')
const promptsDir = path.join(toolsRoot, 'prompts')
const buildControlUrl = 'https://app.notion.com/p/38241c470daf8146a1f6d9b28cc498f3'

const definitions = [
  ['P01', 'Repository Foundation', 'codex', '1'],
  ['P02', 'Database', 'codex', '1'],
  ['P03', 'Core Infrastructure + AI', 'codex', '1'],
  ['P04', 'WhatsApp Channel', 'codex', '1'],
  ['P05', 'Clinic Bot', 'codex', '1'],
  ['P06', 'Appointment Scheduler', 'codex', '1'],
  ['P07', 'Secretary Alerts', 'codex', '1'],
  ['P08', 'Auth & API', 'codex', '1'],
  ['P09', 'Clinic Inbox + IA Studio', 'claude-code', '1'],
  ['P10', 'License Manager', 'codex', '1'],
  ['P11', 'IA Studio Admin Panel', 'claude-code', '1'],
  ['P12', 'Voice Transcription Service', 'codex', '1'],
  ['P13', 'Installer (DeployKit)', 'codex', '2'],
  ['P14', 'Facebook Messenger', 'codex', '2'],
  ['P15', 'Instagram Direct', 'codex', '2'],
  ['P16', 'Phase 2 Features', 'codex', '2'],
  ['P17', 'Testing & CI/CD', 'codex', '2'],
  ['P18', 'Phase 3 Features', 'codex', '3'],
  ['P19', 'Compliance & Launch', 'codex', '1']
] as const

type PageProps = { searchParams?: { message?: string; error?: string } }
type Phase = { id: string; status: 'not-started' | 'in-progress' | 'done'; completedAt?: string; commitHash?: string }
type Control = { phaseId: string; status: string; updatedAt: string; notes?: string; commitHash?: string }

function readJson<T>(file: string, fallback: T) {
  if (!fs.existsSync(file)) return fallback
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function phaseState() {
  const fallback: Phase[] = definitions.map(([id]) => ({ id, status: 'not-started' as const }))
  const current = readJson<Phase[]>(phasesFile, fallback)
  const byId = new Map(current.map((phase) => [phase.id, phase]))
  return fallback.map((phase) => byId.get(phase.id) ?? phase)
}

function controlState() {
  const fallback: Control[] = definitions.map(([id]) => ({ phaseId: id, status: 'pending', updatedAt: new Date(0).toISOString() }))
  const current = readJson<Control[]>(buildControlFile, fallback)
  const byId = new Map(current.map((record) => [record.phaseId, record]))
  return fallback.map((record) => byId.get(record.phaseId) ?? record)
}

function promptInfo(id: string) {
  const promptFile = path.join(promptsDir, `${id}-CODEX-PROMPT.md`)
  const contextFile = path.join(promptsDir, `${id}-CONTEXT.md`)
  const promptChars = fs.existsSync(promptFile) ? fs.readFileSync(promptFile, 'utf8').length : 0
  const contextChars = fs.existsSync(contextFile) ? fs.readFileSync(contextFile, 'utf8').length : 0
  return { promptChars, contextChars, hasContext: contextChars > 0 }
}

function statusClass(status: string) {
  if (status === 'complete' || status === 'done') return 'bg-emerald-900 text-emerald-100'
  if (status === 'failed') return 'bg-red-900 text-red-100'
  if (status === 'output-copied' || status === 'gates-running' || status === 'pushing') return 'bg-cyan-900 text-cyan-100'
  if (status === 'awaiting-output' || status === 'in-progress') return 'bg-amber-900 text-amber-100'
  return 'bg-slate-800 text-slate-300'
}

function githubCommitUrl(hash?: string) {
  return hash ? `https://github.com/JungleAsian/Creascent-Development/commit/${hash}` : ''
}

export default function BuildControlPage({ searchParams }: PageProps) {
  const phases = phaseState()
  const controls = controlState()
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]))
  const controlById = new Map(controls.map((record) => [record.phaseId, record]))
  const currentDefinition = definitions.find(([id]) => phaseById.get(id)?.status !== 'done') ?? definitions[definitions.length - 1]
  const [currentId, currentName, currentBuilder] = currentDefinition
  const currentControl = controlById.get(currentId) ?? { phaseId: currentId, status: 'pending', updatedAt: new Date(0).toISOString() }
  const done = phases.filter((phase) => phase.status === 'done').length
  const currentPrompt = promptInfo(currentId)

  return (
    <section className="max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Build Control</h1>
          <p className="mt-2 text-sm text-slate-400">One-button build control for Codex Pro and Claude Code phases.</p>
        </div>
        <a href={buildControlUrl} target="_blank" rel="noreferrer" className="rounded-md border border-slate-700 px-3 py-2 text-sm text-sky-300 hover:bg-slate-800">Open Notion spec</a>
      </div>

      {searchParams?.message && <p className="mt-3 text-sm text-emerald-300">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-3 text-sm text-red-300">{searchParams.error}</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm text-slate-400">Current phase</div>
              <h2 className="mt-1 text-xl font-semibold">{currentId} — {currentName}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={currentBuilder === 'claude-code' ? 'rounded bg-purple-900 px-2 py-1 text-xs text-purple-100' : 'rounded bg-blue-900 px-2 py-1 text-xs text-blue-100'}>{currentBuilder}</span>
                <span className={`rounded px-2 py-1 text-xs ${statusClass(currentControl.status)}`}>{currentControl.status}</span>
              </div>
            </div>
            <div className="text-right text-sm text-slate-400">{done}/19 complete</div>
          </div>

          <div className="mt-4 h-3 rounded bg-slate-800"><div className="h-3 rounded bg-cyan-500" style={{ width: `${Math.round((done / 19) * 100)}%` }} /></div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded border border-slate-800 p-3">
              <div className="text-xs text-slate-500">Prompt</div>
              <div className={currentPrompt.promptChars > 0 ? 'mt-1 text-sm text-emerald-300' : 'mt-1 text-sm text-amber-300'}>{currentPrompt.promptChars > 0 ? `${currentPrompt.promptChars} chars` : 'not synced'}</div>
            </div>
            <div className="rounded border border-slate-800 p-3">
              <div className="text-xs text-slate-500">Context</div>
              <div className={currentPrompt.hasContext ? 'mt-1 text-sm text-emerald-300' : 'mt-1 text-sm text-amber-300'}>{currentPrompt.hasContext ? `${currentPrompt.contextChars} chars` : 'not prepared'}</div>
            </div>
            <div className="rounded border border-slate-800 p-3">
              <div className="text-xs text-slate-500">Updated</div>
              <div className="mt-1 text-sm text-slate-300">{new Date(currentControl.updatedAt).getTime() ? new Date(currentControl.updatedAt).toLocaleString() : 'not yet'}</div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <form action="/api/actions" method="post">
              <input type="hidden" name="action" value="phase-build-watch" />
              <input type="hidden" name="from" value={currentId} />
              <button className="min-h-11 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white">Start Automated Build</button>
            </form>
            <form action="/api/actions" method="post">
              <input type="hidden" name="action" value="phase-context" />
              <input type="hidden" name="phase" value={currentId} />
              <button className="min-h-11 rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800">Prepare Context</button>
            </form>
            <form action="/api/actions" method="post">
              <input type="hidden" name="action" value="phase-output-copied" />
              <input type="hidden" name="phase" value={currentId} />
              <button className="min-h-11 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white">Output Copied to Repo</button>
            </form>
            <form action="/api/actions" method="post">
              <input type="hidden" name="action" value="gates-run" />
              <button className="min-h-11 rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800">Re-run Gates</button>
            </form>
            <form action="/api/actions" method="post">
              <input type="hidden" name="action" value="phase-build-control-init" />
              <button className="min-h-11 rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800">Set Up Build Control</button>
            </form>
          </div>

          {currentControl.notes && <p className="mt-4 text-sm text-slate-400">{currentControl.notes}</p>}
        </div>

        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-semibold">How to continue</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>1. Click Set Up Build Control once if the Notion database is not ready.</p>
            <p>2. Click Start Automated Build.</p>
            <p>3. If Codex Pro opens, paste the prompt into Codex and apply the output to the repo.</p>
            <p>4. Click Output Copied to Repo. DevTools then runs gates, commits, pushes, and advances.</p>
          </div>
          <div className="mt-5 rounded border border-slate-800 p-3">
            <div className="text-xs text-slate-500">Polling check</div>
            <form action="/api/actions" method="post" className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="action" value="phase-poll" />
              <input type="hidden" name="phase" value={currentId} />
              <input type="hidden" name="status" value="output-copied" />
              <button className="rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">Check Output Copied</button>
            </form>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold">Build Progress</h2>
        <div className="mt-4 grid gap-3">
          {definitions.map(([id, name, builder, business]) => {
            const phase = phaseById.get(id)
            const control = controlById.get(id)
            const hash = phase?.commitHash ?? control?.commitHash
            return (
              <div key={id} className="flex flex-wrap items-center gap-3 rounded border border-slate-800 px-3 py-2">
                <strong className="w-12">{id}</strong>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-200">{name}</div>
                  <div className="text-xs text-slate-500">Business phase {business} · {builder}</div>
                </div>
                <span className={`rounded px-2 py-1 text-xs ${statusClass(control?.status ?? 'pending')}`}>{control?.status ?? 'pending'}</span>
                <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">{phase?.status ?? 'not-started'}</span>
                {hash && <a href={githubCommitUrl(hash)} target="_blank" rel="noreferrer" className="rounded border border-slate-700 px-2 py-1 text-xs text-sky-300 hover:bg-slate-800">commit {hash}</a>}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
