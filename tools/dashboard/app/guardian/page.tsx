import { issuesBySource, activeIssues, readHeartbeat, heartbeatLiveness, heartbeatAgeSeconds, readChecks } from '../lib/sentinel-platform'
import { IssueList, SubsystemHeader } from '../sentinel-shared'

export const dynamic = 'force-dynamic'

const CATEGORIES = [
  { id: 'infrastructure', label: 'VPS Infrastructure' },
  { id: 'external-deps', label: 'External Dependencies' },
  { id: 'business-logic', label: 'Business Logic Smoke Tests' }
]

export default function GuardianPage() {
  const hb = readHeartbeat('guardian')
  const liveness = heartbeatLiveness(hb)
  const age = heartbeatAgeSeconds(hb)
  const checks = readChecks('guardian')
  const active = activeIssues(issuesBySource('guardian'))

  return (
    <section className="w-full space-y-6">
      <SubsystemHeader
        title="Guardian"
        emoji="🛡"
        scope="Runtime infrastructure — VPS containers, Redis, Postgres, Caddy, external APIs, SSL, DNS. Guardian runs it. Reads guardian-*.json log files."
        liveness={liveness}
        detail={liveness === 'not-configured' ? 'Configure VPS details to activate' : age === null ? 'no heartbeat' : `heartbeat ${age}s ago`}
      />

      {liveness === 'not-configured' && (
        <div className="rounded-md border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
          Guardian is not configured. Add VPS details and enable Guardian in Sentinel Settings, then it activates on the next daemon cycle.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const rows = checks.filter((c) => c.category === cat.id)
          return (
            <div key={cat.id} className="rounded-md border border-slate-800 bg-slate-900 p-4">
              <div className="text-sm font-semibold">{cat.label}</div>
              <div className="mt-2 flex gap-3 text-xs">
                <span className="text-emerald-300">{rows.filter((r) => r.status === 'pass').length} pass</span>
                <span className="text-amber-300">{rows.filter((r) => r.status === 'warn').length} warn</span>
                <span className="text-red-300">{rows.filter((r) => r.status === 'fail').length} fail</span>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-slate-400">
                {rows.slice(0, 8).map((r) => (
                  <li key={r.checkName}>
                    <span className={r.status === 'fail' ? 'text-red-300' : r.status === 'warn' ? 'text-amber-300' : 'text-slate-400'}>[{r.status}]</span> {r.checkName}
                  </li>
                ))}
                {rows.length === 0 && <li className="text-slate-500">No results yet.</li>}
              </ul>
            </div>
          )
        })}
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-4 text-sm font-semibold">Active Escalations</h2>
        <IssueList issues={active} emptyLabel="No active Guardian escalations." />
      </div>
    </section>
  )
}
