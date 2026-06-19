import { issuesBySource, activeIssues, summarize, readHeartbeat, heartbeatLiveness, heartbeatAgeSeconds } from '../lib/sentinel-platform'
import { IssueList, SubsystemHeader } from '../sentinel-shared'

export const dynamic = 'force-dynamic'

export default function ForgePage() {
  const issues = issuesBySource('forge')
  const active = activeIssues(issues)
  const summary = summarize(issues)
  const hb = readHeartbeat('forge')
  const liveness = heartbeatLiveness(hb)
  const age = heartbeatAgeSeconds(hb)

  return (
    <section className="w-full space-y-6">
      <SubsystemHeader
        title="Forge"
        emoji="🔥"
        scope="Build-time intelligence — phases, gates, Claude sessions, DevTool signals, prompts, GitHub. Forge builds it."
        liveness={liveness}
        detail={age === null ? 'no heartbeat' : `heartbeat ${age}s ago`}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Active" value={summary.active} tone="slate" />
        <Stat label="Critical" value={summary.critical} tone="red" />
        <Stat label="Warnings" value={summary.warning} tone="amber" />
        <Stat label="Needs approval" value={summary.approval} tone="slate" />
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-4 text-sm font-semibold">Forge Issue Queue</h2>
        <IssueList issues={active} emptyLabel="No active Forge issues. Run pnpm tool forge scan to refresh." />
      </div>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'red' | 'amber' }) {
  const cls = tone === 'red' ? 'border-red-800 bg-red-950/20 text-red-200' : tone === 'amber' ? 'border-amber-800 bg-amber-950/20 text-amber-200' : 'border-slate-800 bg-slate-900 text-slate-100'
  return (
    <div className={`rounded-md border p-4 ${cls}`}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}
