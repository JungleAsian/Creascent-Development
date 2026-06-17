import fs from 'node:fs'
import path from 'node:path'

const toolsRoot = path.resolve(process.cwd(), '..')
const envFile = path.join(toolsRoot, '.env.tools')

function parseEnv() {
  if (!fs.existsSync(envFile)) return {}
  return Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter((line) => line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1)]
  }))
}

type PageProps = { searchParams?: { message?: string; error?: string } }

export default function DeployPage({ searchParams }: PageProps) {
  const env = parseEnv()
  const vpsReady = Boolean(env.VPS_HOST && env.VPS_USER && env.VPS_SSH_KEY_PATH && env.VPS_DEPLOY_PATH)
  const actions = [
    ['deploy-check', 'Check VPS'],
    ['deploy-status', 'VPS Status'],
    ['deploy-redis', 'Redis 7 Commands'],
    ['deploy-local', 'Start Local Plan'],
    ['deploy-web', 'Start Web + QR'],
    ['deploy-web-stop', 'Stop Web'],
    ['deploy-env', 'Sync .env Plan'],
    ['deploy-vps', 'Deploy to VPS Plan'],
    ['deploy-rollback', 'Rollback Plan']
  ]

  return (
    <section className="max-w-6xl">
      <h1 className="text-2xl font-semibold">Deploy</h1>
      <p className="mt-2 text-sm text-slate-400">Local machine and Hostinger VPS deployment controls.</p>
      {searchParams?.message && <p className="mt-2 text-sm text-emerald-300">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-2 text-sm text-red-300">{searchParams.error}</p>}

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">SSH connection</h2><p className={vpsReady ? 'mt-2 text-sm text-emerald-300' : 'mt-2 text-sm text-amber-300'}>{vpsReady ? 'Configured' : 'Missing VPS settings'}</p></div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Deploy path</h2><p className="mt-2 text-sm text-slate-300">{env.VPS_DEPLOY_PATH || 'not set'}</p></div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Domain</h2><p className="mt-2 text-sm text-slate-300">{env.VPS_DOMAIN || 'not set'}</p></div>
      </div>

      <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold">Deploy Actions</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map(([action, label]) => (
            <form key={action} action="/api/actions" method="post">
              <input type="hidden" name="action" value={action} />
              <button className="rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">{label}</button>
            </form>
          ))}
        </div>
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
