import fs from 'node:fs'
import path from 'node:path'

const toolsRoot = path.resolve(process.cwd(), '..')
const phasesFile = path.join(toolsRoot, 'logs', 'phases.json')
const promptsDir = path.join(toolsRoot, 'prompts')
const phasePromptsUrl = 'https://app.notion.com/p/38241c470daf81a8b44ef53543e6bb45'

const definitions = [
  ['P01', 'Repository Foundation', 'codex', '1', 'ready'],
  ['P02', 'Database', 'codex', '1', 'ready'],
  ['P03', 'Core Infrastructure + AI', 'codex', '1', 'draft'],
  ['P04', 'WhatsApp Channel', 'codex', '1', 'draft'],
  ['P05', 'Clinic Bot', 'codex', '1', 'draft'],
  ['P06', 'Appointment Scheduler', 'codex', '1', 'draft'],
  ['P07', 'Secretary Alerts', 'codex', '1', 'draft'],
  ['P08', 'Auth & API', 'codex', '1', 'draft'],
  ['P09', 'Clinic Inbox + IA Studio', 'claude-code', '1', 'ready'],
  ['P10', 'License Manager', 'codex', '1', 'draft'],
  ['P11', 'IA Studio Admin Panel', 'claude-code', '1', 'ready'],
  ['P12', 'Voice Transcription Service', 'codex', '1', 'draft'],
  ['P13', 'Installer (DeployKit)', 'codex', '2', 'draft'],
  ['P14', 'Facebook Messenger', 'codex', '2', 'draft'],
  ['P15', 'Instagram Direct', 'codex', '2', 'draft'],
  ['P16', 'Phase 2 Features', 'codex', '2', 'draft'],
  ['P17', 'Testing & CI/CD', 'codex', '2', 'draft'],
  ['P18', 'Phase 3 Features', 'codex', '3', 'draft'],
  ['P19', 'Compliance & Launch', 'codex', '1', 'draft']
] as const

type Phase = { id: string; status: 'not-started' | 'in-progress' | 'done'; completedAt?: string }
type PageProps = { searchParams?: { message?: string; error?: string } }

function phases() {
  const fallback = definitions.map(([id]) => ({ id, status: 'not-started' as const }))
  if (!fs.existsSync(phasesFile)) return fallback
  const data = JSON.parse(fs.readFileSync(phasesFile, 'utf8')) as Phase[]
  const byId = new Map(data.map((phase) => [phase.id, phase]))
  return fallback.map((phase) => byId.get(phase.id) ?? phase)
}

function promptInfo(id: string) {
  const file = path.join(promptsDir, `${id}-CODEX-PROMPT.md`)
  if (!fs.existsSync(file)) return { exists: false, usable: false, chars: 0, synced: '', issue: 'prompt not synced' }
  const stat = fs.statSync(file)
  const text = fs.readFileSync(file, 'utf8')
  const placeholder = text.includes('Paste the full') || text.includes('No prompt content found') || text.includes('record P01 to Notion') || text.includes('record P02 to Notion')
  const usable = !placeholder && text.trim().length >= 1000
  const issue = usable ? '' : placeholder ? 'placeholder prompt' : 'prompt too short'
  return { exists: true, usable, chars: text.length, synced: stat.mtime.toLocaleString(), issue }
}

export default function PhasesPage({ searchParams }: PageProps) {
  const state = phases()
  const byId = new Map(state.map((phase) => [phase.id, phase]))
  const done = state.filter((phase) => phase.status === 'done').length
  const p11Done = byId.get('P11')?.status === 'done'
  const readyBlocked = definitions
    .filter(([id, , , , prompt]) => prompt === 'ready' && !promptInfo(id).exists)
    .map(([id]) => id)
  const readyInvalid = definitions
    .filter(([id, , , , prompt]) => prompt === 'ready' && promptInfo(id).exists && !promptInfo(id).usable)
    .map(([id]) => id)
  const buildBlocked = [...readyBlocked, ...readyInvalid]

  return (
    <section className="max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Phase Progress</h1>
          <p className="mt-2 text-sm text-slate-400">{done}/19 phases complete</p>
        </div>
        <div className="h-3 w-72 rounded bg-slate-800"><div className="h-3 rounded bg-cyan-500" style={{ width: `${Math.round((done / 19) * 100)}%` }} /></div>
      </div>
      {searchParams?.message && <p className="mt-2 text-sm text-emerald-300">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-2 text-sm text-red-300">{searchParams.error}</p>}
      {p11Done && <div className="mt-4 rounded-md border border-amber-500 bg-amber-950/40 p-4 text-sm text-amber-200">Submit to Meta NOW. WhatsApp approval should start after P11, not after P19.</div>}

      <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Prompt Sync Status</h2>
            <p className={buildBlocked.length === 0 ? 'mt-1 text-sm text-emerald-300' : 'mt-1 text-sm text-amber-300'}>
              {buildBlocked.length === 0 ? 'All ready prompts are cached and usable.' : `Build blocked until full prompts are available for: ${buildBlocked.join(', ')}`}
            </p>
          </div>
          <a href={phasePromptsUrl} target="_blank" rel="noreferrer" className="rounded-md border border-slate-700 px-3 py-2 text-sm text-sky-300 hover:bg-slate-800">Open in Notion</a>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <form action="/api/phases/sync" method="post"><button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-950">Sync from Notion</button></form>
          <form action="/api/actions" method="post" className="flex gap-2">
            <input type="hidden" name="action" value="phase-build" />
            <select name="from" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
              {definitions.map(([id]) => <option key={id} value={id}>Resume from {id}</option>)}
            </select>
            <button disabled={buildBlocked.length > 0} className="rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">Start Automated Build</button>
          </form>
          <form action="/api/actions" method="post"><input type="hidden" name="action" value="phase-build-dry-run" /><button className="rounded-md border border-slate-700 px-3 py-2 text-sm">Dry Run</button></form>
        </div>
        <p className="mt-3 text-xs text-slate-500">Build output is written to /tools/logs/phase-YYYY-MM-DD.log.</p>
      </div>

      <div className="mt-6 space-y-3">
        {definitions.map(([id, name, builder, business, prompt]) => {
          const phase = byId.get(id) ?? { id, status: 'not-started' as const }
          const info = promptInfo(id)
          return (
            <div key={id} className="rounded-md border border-slate-800 bg-slate-900 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <strong className="w-14">{id}</strong>
                <div className="min-w-64 flex-1">
                  <div className="font-medium">{name}</div>
                  <div className={info.usable ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-amber-300'}>Business phase {business} · {info.exists ? `${info.chars} chars · synced ${info.synced}${info.usable ? '' : ` · ${info.issue}`}` : 'prompt not synced'}</div>
                </div>
                <span className={builder === 'claude-code' ? 'rounded bg-purple-900 px-2 py-1 text-xs text-purple-100' : 'rounded bg-blue-900 px-2 py-1 text-xs text-blue-100'}>{builder}</span>
                <span className={prompt === 'ready' ? 'rounded bg-emerald-900 px-2 py-1 text-xs text-emerald-100' : 'rounded bg-slate-800 px-2 py-1 text-xs text-slate-300'}>{prompt}</span>
                <span className="rounded bg-slate-800 px-2 py-1 text-sm">{phase.status}</span>
                <form action="/api/actions" method="post"><input type="hidden" name="action" value="phase-start" /><input type="hidden" name="phase" value={id} /><button disabled={phase.status !== 'not-started' || (prompt === 'ready' && !info.usable)} className="rounded border border-slate-700 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:text-slate-600">Start</button></form>
                <form action="/api/actions" method="post"><input type="hidden" name="action" value="phase-done" /><input type="hidden" name="phase" value={id} /><button disabled={phase.status === 'done'} className="rounded border border-slate-700 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:text-slate-600">Mark Done</button></form>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
