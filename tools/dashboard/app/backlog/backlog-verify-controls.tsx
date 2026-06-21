'use client'

import { useRef } from 'react'

// Per-item verification: a Verify button runs the headless check (Claude rates
// confidence the fix actually works). >= 8 auto-marks done; below 8 the item is
// flagged for review with a reason readable via the Reason dialog, plus an
// Approve button to accept it anyway.
export function BacklogVerifyControls({
  id,
  title,
  status,
  verifyConfidence,
  verifyReason
}: {
  id: number
  title: string
  status: string
  verifyConfidence?: number
  verifyReason?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const flagged = typeof verifyConfidence === 'number' && verifyConfidence < 8 && Boolean(verifyReason)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status !== 'done' && (
        <form action="/api/actions" method="post">
          <input type="hidden" name="action" value="backlog-verify" />
          <input type="hidden" name="id" value={id} />
          <button
            className="whitespace-nowrap rounded-md border border-sky-700 bg-sky-950/30 px-2 py-0.5 text-[11px] font-medium leading-5 text-sky-100 hover:bg-sky-950/60"
            title="Verify the fix actually works — Claude rates confidence; ≥8 marks it done, below flags it for review with a reason."
          >
            Verify
          </button>
        </form>
      )}

      {typeof verifyConfidence === 'number' && (
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${verifyConfidence >= 8 ? 'bg-emerald-900 text-emerald-100' : 'bg-amber-900 text-amber-100'}`}>verify {verifyConfidence}/10</span>
      )}

      {flagged && (
        <>
          <button
            type="button"
            onClick={() => ref.current?.showModal()}
            className="whitespace-nowrap rounded-md border border-amber-700 px-2 py-0.5 text-[11px] font-medium leading-5 text-amber-100 hover:bg-amber-950/40"
          >
            Reason
          </button>
          <form action="/api/actions" method="post">
            <input type="hidden" name="action" value="backlog-approve" />
            <input type="hidden" name="id" value={id} />
            <button className="whitespace-nowrap rounded-md border border-emerald-700 px-2 py-0.5 text-[11px] font-medium leading-5 text-emerald-100 hover:bg-emerald-950/40">Approve</button>
          </form>

          <dialog
            ref={ref}
            className="m-auto w-[min(40rem,92vw)] rounded-lg border border-slate-700 bg-slate-900 p-0 text-slate-200 backdrop:bg-black/60"
            onClick={(event) => { if (event.target === ref.current) ref.current?.close() }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <h3 className="min-w-0 truncate text-sm font-semibold text-slate-100">Verification #{id}: {title}</h3>
              <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">✕</button>
            </div>
            <div className="space-y-3 px-4 py-4">
              <p className="text-xs text-slate-400">
                Confidence <span className="rounded bg-amber-900 px-1.5 py-0.5 text-[11px] font-medium text-amber-100">{verifyConfidence}/10</span> — below 8, so it needs your review.
              </p>
              <div className="whitespace-pre-wrap rounded-md border border-slate-700 bg-slate-950 p-3 text-xs leading-5 text-slate-100">{verifyReason}</div>
              <div className="flex flex-wrap justify-end gap-2">
                <form action="/api/actions" method="post">
                  <input type="hidden" name="action" value="backlog-verify" />
                  <input type="hidden" name="id" value={id} />
                  <button className="rounded-md border border-sky-700 px-3 py-1.5 text-xs text-sky-100 hover:bg-sky-950/40">Re-verify</button>
                </form>
                <form action="/api/actions" method="post">
                  <input type="hidden" name="action" value="backlog-approve" />
                  <input type="hidden" name="id" value={id} />
                  <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500">Approve &amp; mark done</button>
                </form>
              </div>
            </div>
          </dialog>
        </>
      )}
    </div>
  )
}
