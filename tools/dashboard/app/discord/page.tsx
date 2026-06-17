import fs from 'node:fs'
import path from 'node:path'

const envFile = path.resolve(process.cwd(), '..', '.env.tools')
type PageProps = { searchParams?: { message?: string; error?: string } }

function configured() {
  if (!fs.existsSync(envFile)) return false
  const env = fs.readFileSync(envFile, 'utf8')
  return /DISCORD_BOT_TOKEN=.+/.test(env) && /DISCORD_CHANNEL_ID=.+/.test(env)
}

export default function DiscordPage({ searchParams }: PageProps) {
  const isConfigured = configured()
  return (
    <section>
      <h1 className="text-2xl font-semibold">Discord Status</h1>
      {searchParams?.message && <p className="mt-2 text-sm text-emerald-300">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-2 text-sm text-red-300">{searchParams.error}</p>}
      <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900 p-5">
        <p>Status: {isConfigured ? 'configured' : 'not configured'}</p>
        <form action="/api/actions" method="post">
          <input type="hidden" name="action" value="discord-test" />
          <button className="mt-4 rounded-md border border-slate-700 px-3 py-2">Test notification</button>
        </form>
      </div>
    </section>
  )
}
