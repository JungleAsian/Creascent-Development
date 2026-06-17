export default function CostPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold">API Cost</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">Today</h2><p className="mt-4 text-3xl">$0.00</p></div>
        <form className="rounded-lg border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">Log Cost Entry</h2><input className="mt-4 w-full rounded border border-slate-700 bg-slate-950 p-2" placeholder="Provider" /></form>
      </div>
    </section>
  )
}
