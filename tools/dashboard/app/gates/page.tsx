const gates = ['Typecheck', 'Lint', 'Unit tests', 'RLS cross-clinic', 'Env', 'DAL']

export default function GatesPage() {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Six Gates</h1>
        <form action="/api/gates/run" method="post"><button className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950">Run All Gates</button></form>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {gates.map((gate, index) => (
          <div key={gate} className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Gate {index + 1}</p>
            <h2 className="mt-1 font-semibold">{gate}</h2>
            <p className="mt-3 text-sm text-slate-400">Last result: not run</p>
          </div>
        ))}
      </div>
    </section>
  )
}
