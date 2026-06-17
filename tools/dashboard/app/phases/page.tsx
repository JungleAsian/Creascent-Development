export default function PhasesPage() {
  const phases = Array.from({ length: 10 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`)
  return (
    <section>
      <h1 className="text-2xl font-semibold">Phase Progress</h1>
      <div className="mt-6 space-y-3">
        {phases.map((phase) => (
          <div key={phase} className="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
            <strong className="w-16">{phase}</strong>
            <div className="h-2 flex-1 rounded bg-slate-800"><div className="h-2 w-0 rounded bg-cyan-500" /></div>
            <span className="rounded bg-slate-800 px-2 py-1 text-sm">Not Started</span>
            <button className="rounded border border-slate-700 px-3 py-1 text-sm">Start</button>
            <button className="rounded border border-slate-700 px-3 py-1 text-sm">Mark Done</button>
          </div>
        ))}
      </div>
    </section>
  )
}
