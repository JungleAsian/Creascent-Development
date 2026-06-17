import fs from 'node:fs'
import path from 'node:path'

const phasesFile = path.resolve(process.cwd(), '..', 'logs', 'phases.json')

type Phase = { id: string; status: 'not-started' | 'in-progress' | 'done' }
type PageProps = { searchParams?: { message?: string; error?: string } }

function phases() {
  if (!fs.existsSync(phasesFile)) {
    return Array.from({ length: 10 }, (_, index) => ({ id: `P${String(index + 1).padStart(2, '0')}`, status: 'not-started' as const }))
  }
  return JSON.parse(fs.readFileSync(phasesFile, 'utf8')) as Phase[]
}

export default function PhasesPage({ searchParams }: PageProps) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">Phase Progress</h1>
      {searchParams?.message && <p className="mt-2 text-sm text-emerald-300">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-2 text-sm text-red-300">{searchParams.error}</p>}
      <div className="mt-6 space-y-3">
        {phases().map((phase) => {
          const width = phase.status === 'done' ? 'w-full' : phase.status === 'in-progress' ? 'w-1/2' : 'w-0'
          return (
            <div key={phase.id} className="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
              <strong className="w-16">{phase.id}</strong>
              <div className="h-2 flex-1 rounded bg-slate-800"><div className={`h-2 rounded bg-cyan-500 ${width}`} /></div>
              <span className="rounded bg-slate-800 px-2 py-1 text-sm">{phase.status}</span>
              <form action="/api/actions" method="post">
                <input type="hidden" name="action" value="phase-start" />
                <input type="hidden" name="phase" value={phase.id} />
                <button disabled={phase.status !== 'not-started'} className="rounded border border-slate-700 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:text-slate-600">Start</button>
              </form>
              <form action="/api/actions" method="post">
                <input type="hidden" name="action" value="phase-done" />
                <input type="hidden" name="phase" value={phase.id} />
                <button disabled={phase.status === 'done'} className="rounded border border-slate-700 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:text-slate-600">Mark Done</button>
              </form>
            </div>
          )
        })}
      </div>
    </section>
  )
}
