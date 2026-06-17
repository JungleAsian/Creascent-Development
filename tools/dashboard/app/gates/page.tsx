const gates = ['Typecheck', 'Lint', 'Unit tests', 'RLS cross-clinic', 'Env', 'DAL']

type PageProps = {
  searchParams?: { message?: string; error?: string }
}

export default function GatesPage({ searchParams }: PageProps) {
  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Six Gates</h1>
          {searchParams?.message && <p className="mt-2 text-sm text-emerald-300">{searchParams.message}</p>}
          {searchParams?.error && <p className="mt-2 text-sm text-red-300">{searchParams.error}</p>}
        </div>
        <form action="/api/actions" method="post">
          <input type="hidden" name="action" value="gates-run" />
          <button className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950">Run All Gates</button>
        </form>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {gates.map((gate, index) => (
          <div key={gate} className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Gate {index + 1}</p>
            <h2 className="mt-1 font-semibold">{gate}</h2>
            <p className="mt-3 text-sm text-slate-400">Run all gates to refresh status.</p>
          </div>
        ))}
      </div>
    </section>
  )
}
