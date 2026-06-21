import { issuesBySource, activeIssues, readHeartbeat, heartbeatLiveness, heartbeatAgeSeconds, readChecks, readAudit } from '../lib/sentinel-platform'
import { CompactSection } from '../compact-ui'
import { IssueList, SubsystemHeader } from '../sentinel-shared'
import { BlockerPanel, EventTimeline, GateReadinessMatrix, HeartbeatVisual, NextActionPanel, SystemStatusBanner } from '../sentinel-visuals'
import { AutoRefresh } from '../auto-refresh'

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
      <AutoRefresh seconds={15} />
      <SubsystemHeader
        title="Guardian"
        emoji="🛡"
        scope="Runtime infrastructure — VPS containers, Redis, Postgres, Caddy, external APIs, SSL, DNS. Guardian runs it. Reads guardian-*.json log files."
        liveness={liveness}
        detail={liveness === 'not-configured' ? 'Configure VPS details to activate' : age === null ? 'no heartbeat' : `heartbeat ${age}s ago`}
      />

      <SystemStatusBanner
        title="Guardian Deployment Safety"
        question="Is it safe?"
        state={liveness}
        detail="Guardian watches VPS infrastructure, runtime services, SSL, DNS, environment readiness, and deployment gates."
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

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <HeartbeatVisual label="Guardian" heartbeat={hb} />
        <GateReadinessMatrix checks={checks} />
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-4 text-sm font-semibold">Active Escalations</h2>
        <IssueList issues={active} emptyLabel="No active Guardian escalations." />
      </div>

      <CompactSection title="Runtime Events, Blockers, and Next Actions" subtitle="Detailed Guardian runtime events and deployment safety guidance.">
        <div className="grid gap-4 xl:grid-cols-2">
          <EventTimeline title="Recent Runtime Events" audit={readAudit().filter((entry) => /guardian|vps|deploy|runtime|redis|postgres|caddy/i.test(`${entry.subsystem ?? ''} ${entry.action ?? ''} ${entry.message ?? ''}`))} />
          <BlockerPanel issues={active} title="Deployment Blockers" />
        </div>
        <div className="mt-4">
          <NextActionPanel
            actions={[
              'Run the runtime check before deployment and resolve any failed gate.',
              'Only enable deploy actions after environment, database, Redis, and app URL checks pass.',
              'Use rollback readiness before marking VPS deployment as successful.'
            ]}
          />
        </div>
      </CompactSection>
    </section>
  )
}
