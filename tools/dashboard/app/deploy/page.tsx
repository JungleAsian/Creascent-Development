import fs from 'node:fs'
import path from 'node:path'

const toolsRoot = path.resolve(process.cwd(), '..')
const envFile = path.join(toolsRoot, '.env.tools')
const postDeploymentFile = path.join(toolsRoot, 'logs', 'post-deployment.json')

function parseEnv() {
  if (!fs.existsSync(envFile)) return {}
  return Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter((line) => line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1)]
  }))
}

type PageProps = { searchParams?: { message?: string; error?: string } }
type CheckStatus = 'pass' | 'warning' | 'fail'
type PostDeploymentRun = {
  createdAt: string
  summary: { pass: number; warning: number; fail: number }
  checks: Array<{ name: string; status: CheckStatus; message: string }>
}

function readPostDeployment() {
  if (!fs.existsSync(postDeploymentFile)) return undefined
  try {
    return (JSON.parse(fs.readFileSync(postDeploymentFile, 'utf8')) as PostDeploymentRun[])[0]
  } catch {
    return undefined
  }
}

function checkStatus(run: PostDeploymentRun | undefined, name: string) {
  return run?.checks.find((check) => check.name === name)
}

function statusClass(status?: CheckStatus) {
  if (status === 'pass') return 'text-emerald-300'
  if (status === 'warning') return 'text-amber-300'
  if (status === 'fail') return 'text-red-300'
  return 'text-slate-400'
}

export default function DeployPage({ searchParams }: PageProps) {
  const env = parseEnv()
  const latest = readPostDeployment()
  const vpsReady = Boolean(env.VPS_HOST && env.VPS_USER && env.VPS_SSH_KEY_PATH && env.VPS_DEPLOY_PATH)
  const runtimeDependencies = [
    ['Docker engine', 'Runs local Postgres and Redis containers.'],
    ['Postgres port', 'Database required for login and app data.'],
    ['Redis port', 'Queue/cache runtime used by background jobs.'],
    ['API health', 'Confirms the local API can respond.'],
    ['Demo login', 'Confirms seeded test credentials work.']
  ] as const
  const actions = [
    ['deploy-check', 'Check VPS'],
    ['deploy-status', 'VPS Status'],
    ['deploy-redis', 'Redis 7 Commands'],
    ['deploy-local', 'Start Local Plan'],
    ['deploy-env', 'Sync .env Plan'],
    ['deploy-vps', 'Deploy to VPS Plan'],
    ['deploy-rollback', 'Rollback Plan']
  ]

  return (
    <section className="w-full">
      <h1 className="text-2xl font-semibold">Deploy</h1>
      <p className="mt-2 text-sm text-slate-400">Local machine and Hostinger VPS deployment controls.</p>
      {searchParams?.message && <p className="mt-2 text-sm text-emerald-300">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-2 text-sm text-red-300">{searchParams.error}</p>}

      <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">SSH connection</h2><p className={vpsReady ? 'mt-2 text-sm text-emerald-300' : 'mt-2 text-sm text-amber-300'}>{vpsReady ? 'Configured' : 'Missing VPS settings'}</p></div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Deploy path</h2><p className="mt-2 text-sm text-slate-300">{env.VPS_DEPLOY_PATH || 'not set'}</p></div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Domain</h2><p className="mt-2 text-sm text-slate-300">{env.VPS_DOMAIN || 'not set'}</p></div>
      </div>

      <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold">Deploy Actions</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
          <form action="/api/actions" method="post">
            <input type="hidden" name="action" value="post-deploy-check" />
            <button className="min-h-11 w-full rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-500 lg:w-auto">Run Runtime Check</button>
          </form>
          {actions.map(([action, label]) => (
            <form key={action} action="/api/actions" method="post">
              <input type="hidden" name="action" value={action} />
              <button className="min-h-11 w-full rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 lg:w-auto">{label}</button>
            </form>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Local Deployment Runtime</h2>
            <p className="mt-2 text-sm text-slate-400">These dependencies are required after the build and before VPS deployment.</p>
          </div>
          <a href="/post-deployment" className="rounded-md border border-slate-700 px-3 py-2 text-sm text-sky-300 hover:bg-slate-800">Open Post-Deployment Log</a>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {runtimeDependencies.map(([name, description]) => {
            const check = checkStatus(latest, name)
            return (
              <div key={name} className="rounded border border-slate-800 bg-slate-950/40 p-3">
                <div className="text-sm font-medium text-slate-200">{name}</div>
                <div className={`mt-1 text-sm ${statusClass(check?.status)}`}>{check?.status ?? 'not checked'}</div>
                <p className="mt-2 text-xs text-slate-500">{check?.message ?? description}</p>
              </div>
            )
          })}
        </div>
        {latest && <p className="mt-3 text-xs text-slate-500">Last runtime check: {new Date(latest.createdAt).toLocaleString()} · {latest.summary.fail} issue(s)</p>}
      </div>

      <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold">Service Layout</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {['docmee-api :3001', 'docmee-workers', 'docmee-inboxos :3000', 'docmee-licensekit :3002'].map((service) => <div key={service} className="rounded border border-slate-800 px-3 py-2 text-sm text-slate-300">{service}</div>)}
        </div>
      </div>
    </section>
  )
}
