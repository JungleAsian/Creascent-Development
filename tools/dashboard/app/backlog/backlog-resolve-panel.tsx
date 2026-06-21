'use client'

import { useRef, useState } from 'react'

// Per-item resolution: pick an AI to assign (Claude auto-runs via the headless
// CLI; the others are guided manual handoffs — copy the plan + open the tool),
// edit the plan/instruction, hand off, then save the assignment + commit/PR.
type Agent = 'claude' | 'codex' | 'grok' | 'cursor' | 'gemini' | 'deepseek'

const PROVIDERS: Record<Agent, { label: string; url?: string }> = {
  claude: { label: 'Claude' },
  codex: { label: 'Codex', url: 'https://chatgpt.com/codex' },
  grok: { label: 'Grok', url: 'https://grok.com' },
  cursor: { label: 'Cursor', url: 'https://cursor.com' },
  gemini: { label: 'Gemini', url: 'https://gemini.google.com/app' },
  deepseek: { label: 'DeepSeek', url: 'https://chat.deepseek.com' }
}
const AGENTS = Object.keys(PROVIDERS) as Agent[]

export function BacklogResolvePanel({
  id,
  title,
  lane,
  phase,
  priority,
  plan,
  confidence,
  assignee,
  commit,
  pr
}: {
  id: number
  title: string
  lane?: string
  phase: string
  priority: string
  plan?: string
  confidence?: number
  assignee?: string
  commit?: string
  pr?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [agent, setAgent] = useState<Agent>(assignee && assignee in PROVIDERS ? (assignee as Agent) : 'claude')
  const defaultPlan = `Investigate the ${lane || 'relevant'} code for "${title}", design a focused fix, implement it, run local checks, and commit referencing backlog #${id}.`
  const [text, setText] = useState(plan || defaultPlan)
  const close = () => ref.current?.close()
  const provider = PROVIDERS[agent]

  const copyAndOpen = () => {
    const prompt = `Resolve Docmee backlog item #${id}: ${title}.\nLane: ${lane || 'unspecified'} · Phase: ${phase} · Priority: ${priority}.\n\nPlan / instruction:\n${text}`
    navigator.clipboard.writeText(prompt).catch(() => {})
    if (provider.url) window.open(provider.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="whitespace-nowrap rounded-md border border-cyan-700 bg-cyan-950/30 px-2 py-0.5 text-[11px] font-medium leading-5 text-cyan-100 hover:bg-cyan-950/60"
      >
        Resolve
      </button>
      <dialog
        ref={ref}
        className="m-auto w-[min(44rem,94vw)] rounded-lg border border-slate-700 bg-slate-900 p-0 text-slate-200 backdrop:bg-black/60"
        onClick={(event) => { if (event.target === ref.current) close() }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <h3 className="min-w-0 truncate text-sm font-semibold text-slate-100">Resolve #{id}: {title}</h3>
          <button type="button" onClick={close} aria-label="Close" className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">✕</button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">Assign to</span>
            {AGENTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAgent(value)}
                className={`rounded-md border px-2.5 py-1 font-medium ${agent === value ? 'border-cyan-500 bg-cyan-950/40 text-cyan-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
              >
                {PROVIDERS[value].label}
              </button>
            ))}
          </div>

          <div>
            <p className="text-xs text-slate-400">
              Plan / instruction <span className="text-slate-500">(editable)</span>
              {typeof confidence === 'number' && (
                <span className={`ml-2 rounded px-1.5 py-0.5 text-[11px] font-medium ${confidence >= 8 ? 'bg-emerald-900 text-emerald-100' : 'bg-amber-900 text-amber-100'}`}>confidence {confidence}/10</span>
              )}
            </p>
            <textarea value={text} onChange={(event) => setText(event.target.value)} rows={6} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-xs text-slate-100" />
          </div>

          {agent === 'claude' ? (
            <div className="space-y-2">
              <form action="/api/actions" method="post">
                <input type="hidden" name="action" value="backlog-plan" />
                <input type="hidden" name="id" value={id} />
                <button className="w-full rounded-md bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">Auto-plan &amp; resolve →</button>
              </form>
              <p className="text-xs text-slate-500">Claude drafts a plan + rates confidence: <span className="text-emerald-200">≥8 auto-approves &amp; resolves</span>; below that it pauses for your approval here.</p>
              <form action="/api/actions" method="post">
                <input type="hidden" name="action" value="backlog-resolve" />
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="plan" value={text} />
                <button className="w-full rounded-md border border-emerald-700 px-3 py-2 text-xs font-medium text-emerald-100 hover:bg-emerald-950/40">{typeof confidence === 'number' && confidence < 8 ? 'Approve this plan & resolve →' : 'Resolve with this plan (skip auto-plan) →'}</button>
              </form>
            </div>
          ) : (
            <div className="space-y-1">
              <button type="button" onClick={copyAndOpen} className="w-full rounded-md bg-violet-500 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-400">Copy plan + open {provider.label} →</button>
              <p className="text-xs text-amber-200/80">{provider.label} runs manually (no CLI runner here): the plan is copied for you. When done, set the item to <span className="font-medium">review</span> and save the assignment / PR below.</p>
            </div>
          )}

          <div className="border-t border-slate-800 pt-3">
            <form action="/api/actions" method="post" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="action" value="backlog-update" />
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="assignee" value={agent} />
              <label className="text-xs text-slate-400">
                PR link
                <input name="pr" defaultValue={pr ?? ''} placeholder="https://github.com/…/pull/123" className="mt-1 block w-72 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100" />
              </label>
              <button className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">Save assignment &amp; link</button>
              {commit && <span className="text-xs text-slate-500">commit <span className="font-mono text-slate-300">{commit}</span></span>}
            </form>
          </div>
        </div>
      </dialog>
    </>
  )
}
