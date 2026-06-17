export default function LogsPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold">Logs</h1>
      <div className="mt-5 flex gap-3"><select className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2"><option>Select log file</option></select><input className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2" placeholder="Search" /></div>
      <pre className="mt-5 min-h-96 rounded-lg border border-slate-800 bg-black p-4 text-sm text-slate-300">Last 200 lines will appear here.</pre>
    </section>
  )
}
