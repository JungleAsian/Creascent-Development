import fs from 'node:fs'
import path from 'node:path'

const toolsRoot = path.resolve(process.cwd(), '..')
const envFile = path.join(toolsRoot, '.env.tools')
const messagesFile = path.join(toolsRoot, 'logs', 'discord-messages.json')

type PageProps = { searchParams?: { message?: string; error?: string; q?: string } }
type DiscordMessageLog = {
  timestamp: string
  source: string
  channelId?: string
  english: string
  spanish: string
  status: 'sent' | 'failed'
}

function readEnv() {
  if (!fs.existsSync(envFile)) return ''
  return fs.readFileSync(envFile, 'utf8')
}

function hasValue(env: string, key: string) {
  return new RegExp(`^${key}=.+`, 'm').test(env)
}

function routeStatus() {
  const env = readEnv()
  return [
    ['Critical/Important', 'DISCORD_CRITICAL_CHANNEL_ID'],
    ['Development Updates', 'DISCORD_UPDATE_CHANNEL_ID'],
    ['Approval', 'DISCORD_APPROVAL_CHANNEL_ID'],
    ['Stack Intelligence', 'DISCORD_STACK_CHANNEL_ID']
  ].map(([label, key]) => ({ label, key, ready: hasValue(env, key) || hasValue(env, 'DISCORD_CHANNEL_ID') }))
}

function configured() {
  const env = readEnv()
  return (hasValue(env, 'DISCORD_MESSAGING_BOT_TOKEN') || hasValue(env, 'DISCORD_BOT_TOKEN')) && hasValue(env, 'DISCORD_CHANNEL_ID')
}

function readMessages(query?: string) {
  if (!fs.existsSync(messagesFile)) return [] as DiscordMessageLog[]
  const q = query?.trim().toLowerCase()
  const rows = JSON.parse(fs.readFileSync(messagesFile, 'utf8')) as DiscordMessageLog[]
  return rows
    .filter((row) => !q || `${row.timestamp} ${row.source} ${row.english} ${row.spanish} ${row.status}`.toLowerCase().includes(q))
    .slice(-500)
    .reverse()
}

function statusTone(status: DiscordMessageLog['status']) {
  return status === 'sent' ? 'text-emerald-300' : 'text-red-300'
}

export default function DiscordPage({ searchParams }: PageProps) {
  const isConfigured = configured()
  const routes = routeStatus()
  const rows = readMessages(searchParams?.q)

  return (
    <section className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Discord Status</h1>
          <p className="mt-2 text-sm text-slate-400">Message routing status plus a history of Discord notifications sent by DevTools.</p>
        </div>
        <form action="/api/actions" method="post">
          <input type="hidden" name="action" value="discord-test" />
          <button className="min-h-11 rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950">Test Notification</button>
        </form>
      </div>
      {searchParams?.message && <p className="mt-2 text-sm text-emerald-300">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-2 text-sm text-red-300">{searchParams.error}</p>}

      <div className="mt-5 grid gap-3 md:grid-cols-5">
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Discord setup</p>
          <p className={isConfigured ? 'mt-2 text-lg font-semibold text-emerald-300' : 'mt-2 text-lg font-semibold text-red-300'}>{isConfigured ? 'configured' : 'needs setup'}</p>
        </div>
        {routes.map((route) => (
          <div key={route.key} className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs text-slate-500">{route.label}</p>
            <p className={route.ready ? 'mt-2 text-lg font-semibold text-emerald-300' : 'mt-2 text-lg font-semibold text-amber-300'}>{route.ready ? 'ready' : 'fallback only'}</p>
          </div>
        ))}
      </div>

      <form className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
        <input name="q" className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2" placeholder="Search Discord messages" defaultValue={searchParams?.q ?? ''} />
        <button className="min-h-11 rounded-md border border-slate-700 px-4 py-2 text-sm">Apply</button>
      </form>

      <div className="mt-5 max-h-[calc(100vh-300px)] overflow-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-900 text-slate-300">
            <tr><th className="p-3">Timestamp</th><th className="p-3">Source</th><th className="p-3">Status</th><th className="p-3">English message</th><th className="p-3">Spanish message</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((row, index) => (
              <tr key={`${row.timestamp}-${index}`} className="bg-slate-950/60">
                <td className="whitespace-nowrap p-3 text-xs text-slate-400">{new Date(row.timestamp).toLocaleString()}</td>
                <td className="p-3 font-mono text-xs">{row.source}</td>
                <td className={`p-3 text-xs font-semibold ${statusTone(row.status)}`}>{row.status}</td>
                <td className="max-w-xl whitespace-pre-wrap p-3 text-slate-200">{row.english}</td>
                <td className="max-w-xl whitespace-pre-wrap p-3 text-emerald-300">{row.spanish}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="p-3 text-slate-400" colSpan={5}>No Discord messages recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
