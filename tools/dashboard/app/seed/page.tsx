export default function SeedPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold">Seed Generator</h1>
      <div className="mt-5 rounded-md border border-amber-700 bg-amber-950/50 p-4 text-sm text-amber-100">Local/dev seed data only. Do not use production data.</div>
      <div className="mt-5 flex flex-wrap gap-3">{['Seed Clinics', 'Seed Patients', 'Seed Conversations', 'Seed All'].map((label) => <button key={label} className="rounded-md border border-slate-700 px-3 py-2">{label}</button>)}</div>
      <pre className="mt-5 rounded-lg border border-slate-800 bg-black p-4 text-sm">Seeded IDs will appear here.</pre>
    </section>
  )
}
