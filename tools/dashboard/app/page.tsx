import fs from 'node:fs'
import Link from 'next/link'
import path from 'node:path'
import { BuildProgressGauge } from './build-progress-gauge'

const toolsRoot = path.resolve(process.cwd(), '..')
const readyFile = path.join(toolsRoot, 'logs', 'ready.json')
const diagnosticsFile = path.join(toolsRoot, 'logs', 'diagnostics.json')
const phasesFile = path.join(toolsRoot, 'logs', 'phases.json')
const stackFile = path.join(toolsRoot, 'logs', 'stack-intelligence.json')

type ReadyResult = { ready?: boolean; summary?: { pass?: number; warning?: number; critical?: number } }
type DiagnosticsResult = { summary?: { pass?: number; warning?: number; critical?: number } }
type PhaseState = Array<{ id: string; status: string }>
type StackState = { generatedAt?: string; packages?: unknown[]; advisories?: unknown[]; news?: unknown[] }

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

const workCards = [
  ['Ready Check', '/ready', 'Confirm the tool can safely start development.', 'Run before build'],
  ['Build Control', '/build-control', 'Start and monitor Claude Code automation for all 19 phases.', 'Primary workflow'],
  ['Phase Progress', '/phases', 'Review prompt status, phase state, and commits.', '19 phases'],
  ['Diagnostics', '/diagnostics', 'Find local setup, Notion, Discord, and system issues.', 'Health checks'],
  ['Settings', '/settings', 'Fill credentials with plain-language service labels.', 'Configuration'],
  ['Deploy', '/deploy', 'Use local, Tailscale, and VPS deployment controls.', 'Release path']
]

const secondaryCards = [
  ['Agents', '/agents', 'Builder and reviewer setup'],
  ['API Cost', '/cost', 'Runtime, development, and stack intelligence'],
  ['Backlog', '/backlog', 'Known gaps and follow-up work'],
  ['Logs', '/logs', 'Command output and history'],
  ['Webhooks', '/webhooks', 'WhatsApp payload testing'],
  ['Discord Status', '/discord', 'Notification routing tests']
]

export default function Page() {
  const ready = readJson<ReadyResult>(readyFile, {})
  const diagnostics = readJson<DiagnosticsResult>(diagnosticsFile, {})
  const phases = readJson<PhaseState>(phasesFile, [])
  const stack = readJson<StackState>(stackFile, {})
  const done = phases.filter((phase) => phase.status === 'done').length
  const readyCritical = ready.summary?.critical ?? 0
  const diagnosticsCritical = diagnostics.summary?.critical ?? 0
  const stackItems = (stack.packages?.length ?? 0) + (stack.advisories?.length ?? 0) + (stack.news?.length ?? 0)

  return (
    <section className="w-full">
      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
        <div className="ui-panel rounded-md border p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-cyan-300">Operations console</p>
              <h1 className="mt-2 text-3xl font-semibold">Docmee DevTools</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                A local build workbench for prompts, gates, diagnostics, agents, cost, deployment, and Discord routing.
              </p>
            </div>
            <Link href="/ready" className={readyCritical > 0 ? 'rounded-md border border-red-700/70 bg-red-950/40 px-4 py-3 text-sm text-red-100' : 'rounded-md border border-emerald-700/70 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-100'}>
              <span className="block text-xs text-slate-400">Readiness</span>
              <span className="mt-1 block font-semibold">{readyCritical > 0 ? `${readyCritical} blockers` : 'Ready'}</span>
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="ui-soft rounded-md border p-4">
              <div className="text-xs text-slate-500">Ready checks</div>
              <div className="mt-2 text-2xl font-semibold">{ready.summary?.pass ?? 0}</div>
              <div className="mt-1 text-xs text-slate-400">{ready.summary?.warning ?? 0} warnings</div>
            </div>
            <div className="ui-soft rounded-md border p-4">
              <div className="text-xs text-slate-500">Diagnostics</div>
              <div className={diagnosticsCritical > 0 ? 'mt-2 text-2xl font-semibold text-red-300' : 'mt-2 text-2xl font-semibold text-emerald-300'}>{diagnosticsCritical}</div>
              <div className="mt-1 text-xs text-slate-400">critical issues</div>
            </div>
            <div className="ui-soft rounded-md border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500">Phases complete</div>
                  <div className="mt-2 text-2xl font-semibold">{done}/19</div>
                  <div className="mt-1 text-xs text-slate-400">build progress</div>
                </div>
                <BuildProgressGauge size="sm" showLabel={false} />
              </div>
            </div>
            <div className="ui-soft rounded-md border p-4">
              <div className="text-xs text-slate-500">Stack intelligence</div>
              <div className="mt-2 text-2xl font-semibold">{stackItems}</div>
              <div className="mt-1 text-xs text-slate-400">{stack.generatedAt ? 'updated' : 'not updated'}</div>
            </div>
          </div>
        </div>

        <div className="ui-panel rounded-md border p-5">
          <h2 className="text-sm font-semibold">Next Best Action</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {readyCritical > 0
              ? 'Open Ready Check, clear the listed blockers, then return to Build Control.'
              : 'Open Build Control and start the automated phase workflow.'}
          </p>
          <div className="mt-4 grid gap-2">
            <Link href={readyCritical > 0 ? '/ready' : '/build-control'} className="rounded-md bg-cyan-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-cyan-500">
              {readyCritical > 0 ? 'Open Ready Check' : 'Start Build Control'}
            </Link>
            <Link href="/settings" className="ui-action rounded-md border px-4 py-3 text-center text-sm">Review Settings</Link>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {workCards.map(([title, href, body, label]) => (
          <Link key={href} href={href} className="ui-panel ui-card-hover rounded-md border p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold">{title}</h2>
              <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">{label}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
          </Link>
        ))}
      </div>

      <div className="mt-4 ui-panel rounded-md border p-5">
        <h2 className="text-sm font-semibold">Supporting Tools</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {secondaryCards.map(([title, href, body]) => (
            <Link key={href} href={href} className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-slate-800 px-3 py-2 text-sm hover:bg-slate-800">
              <span>{title}</span>
              <span className="truncate text-xs text-slate-500">{body}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

