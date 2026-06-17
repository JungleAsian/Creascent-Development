const rows = Array.from({ length: 45 }, (_, index) => ({
  id: index + 1,
  phase: index < 21 ? 'P01' : index < 31 ? 'P02' : index < 39 ? 'P03' : 'P00',
  priority: index < 7 ? 'Critical' : index < 21 ? 'High' : index < 31 ? 'Medium' : index < 39 ? 'Low' : 'Infrastructure',
  title: `Backlog gap ${index + 1}`,
  status: 'todo'
}))

export default function BacklogPage() {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Backlog</h1>
        <button className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950">Add Task</button>
      </div>
      <div className="mt-4 flex gap-3">
        <select className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"><option>All phases</option></select>
        <select className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"><option>All priorities</option></select>
      </div>
      <table className="mt-5 w-full overflow-hidden rounded-lg text-left text-sm">
        <thead className="bg-slate-900 text-slate-300"><tr><th className="p-3">ID</th><th>Phase</th><th>Priority</th><th>Title</th><th>Status</th><th /></tr></thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row) => (
            <tr key={row.id} className="bg-slate-950/60">
              <td className="p-3">{row.id}</td><td>{row.phase}</td><td><span className="rounded bg-slate-800 px-2 py-1">{row.priority}</span></td><td>{row.title}</td><td>{row.status}</td><td><button className="rounded border border-slate-700 px-2 py-1">Mark Done</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
