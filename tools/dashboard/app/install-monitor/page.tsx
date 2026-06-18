import { InstallMonitorClient } from './monitor-client'

export default function InstallMonitorPage() {
  return (
    <section className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Install Monitor</h1>
          <p className="mt-2 text-sm text-slate-400">Live build visualization merged into DevTools. The separate port 4100 monitor is no longer required for this view.</p>
        </div>
        <a href="/build-control" className="rounded-md border border-slate-700 px-3 py-2 text-sm text-sky-300 hover:bg-slate-800">Build Control</a>
      </div>
      <div className="mt-6">
        <InstallMonitorClient />
      </div>
    </section>
  )
}
