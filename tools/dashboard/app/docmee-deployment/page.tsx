import { backendStage, frontendStage, readDeploymentFeatures, readUiDevelopmentRecords } from './data'
import { LaneLink } from './lane-link'

function percent(done: number, total: number) {
  if (!total) return 0
  return Math.round((done / total) * 100)
}

export default function DocmeeDeploymentPage() {
  const features = readDeploymentFeatures()
  const uiScreens = readUiDevelopmentRecords()
  const backendComplete = features.filter((item) => backendStage(item) === 'complete').length
  const frontendAccepted = features.filter((item) => frontendStage(item) === 'complete').length
  const uiComplete = uiScreens.filter((item) => ['complete', 'accepted', 'done'].includes(item.status.toLowerCase())).length

  return (
    <section>
      <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs uppercase tracking-wide text-cyan-200/80">Docmee deployment center</p>
        <h1 className="mt-1 text-2xl font-semibold">Choose Deployment Lane</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
          Use Backend for implementation records and deployment infrastructure. Use Frontend for product acceptance. Use UI Development for the 17-screen design queue and Claude Design handoff.
        </p>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <LaneLink href="/docmee-deployment-backend" className="group block h-full rounded-md border border-emerald-900/70 bg-emerald-950/20 p-4 hover:border-emerald-500">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-emerald-200/70">Backend</p>
              <h2 className="mt-1 text-xl font-semibold text-emerald-100">Docmee Deployment - Backend</h2>
              <p className="mt-2 text-sm leading-6 text-emerald-100/75">
                APIs, database, workers, tests, integrations, services, environment readiness, deployment checks, and reports.
              </p>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-emerald-700 bg-emerald-950 text-emerald-200">
              <span className="h-6 w-6 bg-current" style={{ WebkitMask: 'url(/lineicons/database-2.svg) center / contain no-repeat', mask: 'url(/lineicons/database-2.svg) center / contain no-repeat' }} />
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded border border-emerald-900/70 bg-slate-950/30 p-3">
              <p className="text-xs text-emerald-200/60">Features</p>
              <p className="mt-1 text-2xl font-semibold">{features.length}</p>
            </div>
            <div className="rounded border border-emerald-900/70 bg-slate-950/30 p-3">
              <p className="text-xs text-emerald-200/60">Complete</p>
              <p className="mt-1 text-2xl font-semibold">{backendComplete}</p>
            </div>
            <div className="rounded border border-emerald-900/70 bg-slate-950/30 p-3">
              <p className="text-xs text-emerald-200/60">Progress</p>
              <p className="mt-1 text-2xl font-semibold">{percent(backendComplete, features.length)}%</p>
            </div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${percent(backendComplete, features.length)}%` }} />
          </div>
          <p className="mt-4 text-sm font-semibold text-emerald-100 group-hover:text-white">Open Backend Workflow</p>
        </LaneLink>

        <LaneLink href="/docmee-deployment-frontend" className="group block h-full rounded-md border border-cyan-900/70 bg-cyan-950/20 p-4 hover:border-cyan-400">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-cyan-200/70">Frontend</p>
              <h2 className="mt-1 text-xl font-semibold text-cyan-100">Docmee Deployment - Frontend</h2>
              <p className="mt-2 text-sm leading-6 text-cyan-100/75">
                Product acceptance, visible screens, mobile fit, language labels, workflow clarity, UI polish, and running-app checks.
              </p>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-cyan-700 bg-cyan-950 text-cyan-200">
              <span className="h-6 w-6 bg-current" style={{ WebkitMask: 'url(/lineicons/verify-report.svg) center / contain no-repeat', mask: 'url(/lineicons/verify-report.svg) center / contain no-repeat' }} />
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded border border-cyan-900/70 bg-slate-950/30 p-3">
              <p className="text-xs text-cyan-200/60">Features</p>
              <p className="mt-1 text-2xl font-semibold">{features.length}</p>
            </div>
            <div className="rounded border border-cyan-900/70 bg-slate-950/30 p-3">
              <p className="text-xs text-cyan-200/60">Accepted</p>
              <p className="mt-1 text-2xl font-semibold">{frontendAccepted}</p>
            </div>
            <div className="rounded border border-cyan-900/70 bg-slate-950/30 p-3">
              <p className="text-xs text-cyan-200/60">Progress</p>
              <p className="mt-1 text-2xl font-semibold">{percent(frontendAccepted, features.length)}%</p>
            </div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${percent(frontendAccepted, features.length)}%` }} />
          </div>
          <p className="mt-4 text-sm font-semibold text-cyan-100 group-hover:text-white">Open Frontend Workflow</p>
        </LaneLink>

        <LaneLink href="/docmee-deployment-ui" className="group block h-full rounded-md border border-amber-900/70 bg-amber-950/20 p-4 hover:border-amber-400" ariaLabel="Open Docmee UI workflow">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-amber-200/70">UI</p>
              <h2 className="mt-1 text-xl font-semibold text-amber-100">Docmee Deployment - UI</h2>
              <p className="mt-2 text-sm leading-6 text-amber-100/75">
                Claude Design queue, screen-by-screen UI build prompts, missing UX notes, visual consistency, and design implementation handoff.
              </p>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-amber-700 bg-amber-950 text-amber-200">
              <span className="h-6 w-6 bg-current" style={{ WebkitMask: 'url(/lineicons/build-play.svg) center / contain no-repeat', mask: 'url(/lineicons/build-play.svg) center / contain no-repeat' }} />
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded border border-amber-900/70 bg-slate-950/30 p-3">
              <p className="text-xs text-amber-200/60">Screens</p>
              <p className="mt-1 text-2xl font-semibold">{uiScreens.length}</p>
            </div>
            <div className="rounded border border-amber-900/70 bg-slate-950/30 p-3">
              <p className="text-xs text-amber-200/60">Complete</p>
              <p className="mt-1 text-2xl font-semibold">{uiComplete}</p>
            </div>
            <div className="rounded border border-amber-900/70 bg-slate-950/30 p-3">
              <p className="text-xs text-amber-200/60">Progress</p>
              <p className="mt-1 text-2xl font-semibold">{percent(uiComplete, uiScreens.length)}%</p>
            </div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${percent(uiComplete, uiScreens.length)}%` }} />
          </div>
          <p className="mt-4 text-sm font-semibold text-amber-100 group-hover:text-white">Open UI Workflow</p>
        </LaneLink>
      </div>

      <div className="mt-5 rounded-md border border-amber-900/70 bg-amber-950/20 p-4">
        <h2 className="text-sm font-semibold text-amber-100">Deployment Rule</h2>
        <p className="mt-2 text-sm leading-6 text-amber-100/80">
          Backend, Frontend, and UI records stay separate. Backend completion tracks implementation. Frontend acceptance tracks what the user can operate in the running app. UI Development tracks the design-led screen queue before acceptance.
        </p>
      </div>
    </section>
  )
}
