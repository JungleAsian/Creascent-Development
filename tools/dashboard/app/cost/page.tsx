import fs from 'node:fs'
import path from 'node:path'

const costFile = path.resolve(process.cwd(), '..', 'logs', 'cost.json')
type PageProps = { searchParams?: { message?: string; error?: string } }
type CostEntry = { provider: string; usd: number; createdAt: string }

function entries() {
  if (!fs.existsSync(costFile)) return []
  return JSON.parse(fs.readFileSync(costFile, 'utf8')) as CostEntry[]
}

export default function CostPage({ searchParams }: PageProps) {
  const today = new Date().toISOString().split('T')[0]
  const data = entries()
  const todaySpend = data.filter((entry) => entry.createdAt.startsWith(today)).reduce((sum, entry) => sum + entry.usd, 0)
  return (
    <section>
      <h1 className="text-2xl font-semibold">API Cost</h1>
      {searchParams?.message && <p className="mt-2 text-sm text-emerald-300">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-2 text-sm text-red-300">{searchParams.error}</p>}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">Today</h2><p className="mt-4 text-3xl">${todaySpend.toFixed(4)}</p></div>
        <form action="/api/actions" method="post" className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <input type="hidden" name="action" value="cost-log" />
          <h2 className="font-semibold">Log Cost Entry</h2>
          <input name="provider" className="mt-4 w-full rounded border border-slate-700 bg-slate-950 p-2" placeholder="Provider" />
          <input name="tokens" className="mt-3 w-full rounded border border-slate-700 bg-slate-950 p-2" placeholder="Tokens" defaultValue="0" />
          <button className="mt-3 rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950">Log Cost</button>
        </form>
      </div>
    </section>
  )
}
