import { readSentinelAudit, readSentinelConfig, readSentinelIssues, scanSentinel, sentinelSummary, type SentinelIssue } from '../lib/sentinel'

type PageProps = { searchParams?: { message?: string; error?: string } }

export const dynamic = 'force-dynamic'

function severityClass(severity: SentinelIssue['severity']) {
  if (severity === 'critical') return 'border-red-800 bg-red-950/30 text-red-200'
  if (severity === 'warning') return 'border-amber-800 bg-amber-950/30 text-amber-200'
  return 'border-cyan-800 bg-cyan-950/30 text-cyan-200'
}

function statusClass(status: SentinelIssue['status']) {
  if (status === 'resolved') return 'border-emerald-800 bg-emerald-950/30 text-emerald-200'
  if (status === 'waiting-approval') return 'border-amber-800 bg-amber-950/30 text-amber-200'
  if (status === 'failed') return 'border-red-800 bg-red-950/30 text-red-200'
  return 'border-slate-700 bg-slate-950/40 text-slate-300'
}

function riskClass(risk: SentinelIssue['riskLevel']) {
  if (risk === 'high') return 'text-red-300'
  if (risk === 'medium') return 'text-amber-300'
  return 'text-emerald-300'
}

function issueSort(left: SentinelIssue, right: SentinelIssue) {
  const rank = { critical: 0, warning: 1, info: 2 }
  return rank[left.severity] - rank[right.severity] || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
}

export default function SentinelPage({ searchParams }: PageProps) {
  const hasIssues = readSentinelIssues().length > 0
  const scanned = hasIssues ? null : scanSentinel()
  const issues = (scanned?.issues ?? readSentinelIssues()).sort(issueSort)
  const config = scanned?.config ?? readSentinelConfig()
  const audit = readSentinelAudit()
  const summary = sentinelSummary(issues)
  const activeIssues = issues.filter((issue) => !['resolved', 'ignored'].includes(issue.status))
  const safeIssues = activeIssues.filter((issue) => !issue.requiresApproval)
  const approvalIssues = activeIssues.filter((issue) => issue.requiresApproval)

  return (
    <section className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Sentinel</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Read-only orchestration layer that observes DevTools signals, creates issue tickets, and routes fixes to the right agent.
          </p>
        </div>
        <form action="/api/actions" method="post">
          <input type="hidden" name="action" value="sentinel-scan" />
          <button className="min-h-11 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500">
            Scan Now
          </button>
        </form>
      </div>

      {searchParams?.message && <p className="mt-3 text-sm text-emerald-300">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-3 text-sm text-red-300">{searchParams.error}</p>}

      <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Mode</div>
          <div className="mt-2 text-lg font-semibold text-slate-100">{config.mode.replace(/-/g, ' ')}</div>
        </div>
        <div className="rounded-md border border-red-800 bg-red-950/20 p-4">
          <div className="text-xs text-red-300">Critical</div>
          <div className="mt-2 text-2xl font-semibold text-red-200">{summary.critical}</div>
        </div>
        <div className="rounded-md border border-amber-800 bg-amber-950/20 p-4">
          <div className="text-xs text-amber-300">Warnings</div>
          <div className="mt-2 text-2xl font-semibold text-amber-200">{summary.warning}</div>
        </div>
        <div className="rounded-md border border-cyan-800 bg-cyan-950/20 p-4">
          <div className="text-xs text-cyan-300">Info</div>
          <div className="mt-2 text-2xl font-semibold text-cyan-200">{summary.info}</div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Needs approval</div>
          <div className="mt-2 text-2xl font-semibold text-slate-100">{summary.approval}</div>
        </div>
        <div className="rounded-md border border-emerald-800 bg-emerald-950/20 p-4">
          <div className="text-xs text-emerald-300">Safe queue</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-200">{summary.safe}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Issue Queue</h2>
            <span className="rounded bg-slate-950/50 px-2 py-1 text-xs text-slate-400">{activeIssues.length} active</span>
          </div>
          <div className="mt-4 space-y-3">
            {activeIssues.length === 0 ? (
              <div className="rounded-md border border-emerald-800 bg-emerald-950/20 p-4 text-sm text-emerald-200">
                No active Sentinel issues. Scan again when something changes.
              </div>
            ) : (
              activeIssues.map((issue) => (
                <article key={issue.id} className="rounded-md border border-slate-800 bg-slate-950/30 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded border px-2 py-1 text-xs ${severityClass(issue.severity)}`}>{issue.severity}</span>
                        <span className={`rounded border px-2 py-1 text-xs ${statusClass(issue.status)}`}>{issue.status.replace(/-/g, ' ')}</span>
                        <span className="rounded bg-slate-900 px-2 py-1 text-xs text-slate-400">{issue.category}</span>
                      </div>
                      <h3 className="mt-3 text-base font-semibold text-slate-100">{issue.diagnosis}</h3>
                      <p className="mt-2 text-sm text-slate-400">{issue.suggestedFix}</p>
                    </div>
                    <div className="min-w-[190px] rounded-md border border-slate-800 bg-slate-900 p-3 text-sm">
                      <div className="text-xs text-slate-500">Route</div>
                      <div className="mt-1 text-slate-200">{issue.assignedAgent}</div>
                      <div className="mt-1 text-xs text-slate-500">{issue.assignedProvider}</div>
                      <div className={`mt-2 text-xs ${riskClass(issue.riskLevel)}`}>Risk: {issue.riskLevel}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-xs font-medium text-slate-500">Evidence</div>
                      <ul className="mt-2 space-y-1 text-sm text-slate-400">
                        {issue.evidence.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">Source signals</div>
                      <ul className="mt-2 space-y-1 text-sm text-slate-400">
                        {issue.sourceSignals.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>Phase: {issue.phase}</span>
                    <span>Updated: {new Date(issue.updatedAt).toLocaleString()}</span>
                    <span>{issue.requiresApproval ? 'Approval required before fix' : 'Safe-fix eligible'}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold">Approval Policy</h2>
            <div className="mt-4 space-y-3">
              <div>
                <div className="text-xs font-medium text-emerald-300">Safe fixes</div>
                <ul className="mt-2 space-y-1 text-sm text-slate-400">
                  {config.safeFixAllowlist.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <div className="text-xs font-medium text-red-300">Always requires approval</div>
                <ul className="mt-2 space-y-1 text-sm text-slate-400">
                  {config.approvalRequired.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold">Routing Summary</h2>
            <div className="mt-4 space-y-2">
              {approvalIssues.slice(0, 5).map((issue) => (
                <div key={issue.id} className="rounded border border-slate-800 px-3 py-2 text-sm">
                  <div className="font-medium text-slate-200">{issue.assignedAgent}</div>
                  <div className="text-xs text-slate-500">{issue.category} via {issue.assignedProvider}</div>
                </div>
              ))}
              {approvalIssues.length === 0 && <p className="text-sm text-slate-400">No approval-required tickets.</p>}
            </div>
          </div>

          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold">Safe Queue</h2>
            <div className="mt-4 space-y-2">
              {safeIssues.slice(0, 5).map((issue) => (
                <div key={issue.id} className="rounded border border-emerald-900/60 px-3 py-2 text-sm text-emerald-200">
                  {issue.diagnosis}
                </div>
              ))}
              {safeIssues.length === 0 && <p className="text-sm text-slate-400">No safe-fix tickets waiting.</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold">Decision Audit</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="border-b border-slate-800 px-3 py-2">Timestamp</th>
                <th className="border-b border-slate-800 px-3 py-2">Action</th>
                <th className="border-b border-slate-800 px-3 py-2">Message</th>
                <th className="border-b border-slate-800 px-3 py-2">Issues</th>
              </tr>
            </thead>
            <tbody>
              {audit.slice(0, 12).map((entry) => (
                <tr key={`${entry.createdAt}-${entry.action}`} className="border-b border-slate-800/70">
                  <td className="px-3 py-2 text-slate-400">{new Date(entry.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-200">{entry.action}</td>
                  <td className="px-3 py-2 text-slate-400">{entry.message}</td>
                  <td className="px-3 py-2 text-slate-400">{entry.issueCount ?? '-'}</td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-sm text-slate-400" colSpan={4}>No Sentinel audit entries yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
