import fs from 'node:fs'
import path from 'node:path'

const toolsRoot = path.resolve(process.cwd(), '..')
const envFile = path.join(toolsRoot, '.env.tools')
const envExampleFile = path.join(toolsRoot, '.env.tools.example')
const backlogFile = path.join(toolsRoot, 'logs', 'backlog.json')

const requiredVars = [
  'TOOLS_DB_URL',
  'TOOLS_DB_SERVICE_KEY',
  'MONOREPO_ROOT',
  'NEXT_PUBLIC_DASHBOARD_PORT',
  'WEBHOOK_TARGET',
  'DEV_LICENSE_SIGNING_KEY'
]

const optionalVars = [
  'DISCORD_BOT_TOKEN',
  'DISCORD_CHANNEL_ID',
  'GATES_STRICT',
  'COST_ALERT_THRESHOLD_USD'
]

const guidance: Record<string, { providerLabel: string; text: string; url?: string; linkLabel?: string }> = {
  TOOLS_DB_URL: {
    providerLabel: 'Supabase: API URL',
    text: 'Supabase local start output. Usually http://localhost:54321.',
    url: 'https://supabase.com/docs/guides/local-development/cli/getting-started',
    linkLabel: 'Supabase local CLI docs'
  },
  TOOLS_DB_SERVICE_KEY: {
    providerLabel: 'Supabase: service_role key',
    text: 'Supabase local start output. Use the local service_role key only.',
    url: 'https://supabase.com/docs/guides/local-development/cli/getting-started',
    linkLabel: 'Supabase local CLI docs'
  },
  MONOREPO_ROOT: { providerLabel: 'Docmee repo root', text: 'Repo layout. Keep ../ when DevTools lives in /tools.' },
  NEXT_PUBLIC_DASHBOARD_PORT: { providerLabel: 'Docmee dashboard port', text: 'Dashboard port. Keep 4000 unless another local service uses it.' },
  WEBHOOK_TARGET: { providerLabel: 'Docmee local webhook URL', text: 'Local API webhook route. Change only if your local API uses a different port/path.' },
  DEV_LICENSE_SIGNING_KEY: { providerLabel: 'Docmee dev signing key', text: 'Local-only signing secret. Use a long random development string.' },
  DISCORD_BOT_TOKEN: {
    providerLabel: 'Discord: Bot Token',
    text: 'Discord developer portal bot token. Leave blank until notifications are configured.',
    url: 'https://discord.com/developers/applications',
    linkLabel: 'Discord developer portal'
  },
  DISCORD_CHANNEL_ID: {
    providerLabel: 'Discord: Channel ID',
    text: 'Discord channel ID for DevTools notifications. Leave blank until Discord is configured.',
    url: 'https://support.discord.com/hc/en-us/articles/206346498',
    linkLabel: 'Discord ID guide'
  },
  GATES_STRICT: { providerLabel: 'Docmee gate strictness', text: 'Local gate behavior. Keep false during early setup.' },
  COST_ALERT_THRESHOLD_USD: { providerLabel: 'Docmee cost alert threshold', text: 'Your daily local cost alert limit, such as 10.' }
}

const safeDefaults = [
  ['Supabase: API URL', 'http://localhost:54321'],
  ['Docmee repo root', '../'],
  ['Docmee dashboard port', '4000'],
  ['Docmee local webhook URL', 'http://localhost:3001/webhook/whatsapp'],
  ['Docmee gate strictness', 'false'],
  ['Docmee cost alert threshold', '10']
]

function parseEnv(content: string) {
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1)]
      })
  )
}

type SettingsPageProps = {
  searchParams?: {
    message?: string
    error?: string
  }
}

export default function SettingsPage({ searchParams }: SettingsPageProps) {
  const envExists = fs.existsSync(envFile)
  const exampleExists = fs.existsSync(envExampleFile)
  const env = envExists ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {}
  const backlogCount = fs.existsSync(backlogFile)
    ? JSON.parse(fs.readFileSync(backlogFile, 'utf8')).length as number
    : 0
  const rows = [
    ...requiredVars.map((name) => ({ name, required: true, present: Boolean(env[name]) })),
    ...optionalVars.map((name) => ({ name, required: false, present: Boolean(env[name]) }))
  ]
  const missingRequired = rows.filter((row) => row.required && !row.present)
  const setupCards = [
    {
      title: 'Configuration file',
      status: envExists ? 'Ready' : 'Missing',
      ok: envExists,
      detail: envExists ? '.env.tools is available locally.' : 'Create the local config file from the example.'
    },
    {
      title: 'Required settings',
      status: missingRequired.length === 0 ? 'Ready' : `${missingRequired.length} missing`,
      ok: missingRequired.length === 0,
      detail: missingRequired.length === 0 ? 'All required settings are present.' : missingRequired.map((row) => guidance[row.name].providerLabel).join(', ')
    },
    {
      title: 'Backlog',
      status: backlogCount === 45 ? 'Ready' : `${backlogCount}/45 tasks`,
      ok: backlogCount === 45,
      detail: backlogCount === 45 ? 'The DevTools backlog is seeded.' : 'Seed the local backlog before starting P01.'
    }
  ]

  return (
    <section className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Setup</h1>
          <p className="mt-2 text-sm text-slate-400">{envExists ? envFile : '.env.tools has not been created yet'}</p>
        </div>
        <div className="flex min-w-72 flex-col items-end gap-2">
          <div className="flex gap-2">
            {!envExists && (
              <form action="/api/settings/env" method="post">
                <input type="hidden" name="action" value="create" />
                <button
                  type="submit"
                  disabled={!exampleExists}
                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-700"
                >
                  Create .env.tools
                </button>
              </form>
            )}
            <form action="/api/settings/env" method="post">
              <input type="hidden" name="action" value="open" />
              <button
                type="submit"
                disabled={!envExists}
                className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                Open .env.tools
              </button>
            </form>
            <form action="/api/settings/env" method="post">
              <input type="hidden" name="action" value="check" />
              <button
                type="submit"
                className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white"
              >
                Run setup check
              </button>
            </form>
          </div>
          {searchParams?.message && <p className="text-right text-xs text-emerald-300">{searchParams.message}</p>}
          {searchParams?.error && <p className="text-right text-xs text-red-300">{searchParams.error}</p>}
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {setupCards.map((card) => (
          <div key={card.title} className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">{card.title}</h2>
              <span className={card.ok ? 'text-sm text-emerald-300' : 'text-sm text-amber-300'}>{card.status}</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">{card.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Backlog setup</h2>
            <p className="mt-1 text-sm text-slate-400">Seed the local DevTools backlog if it is not ready.</p>
          </div>
          <form action="/api/settings/env" method="post">
            <input type="hidden" name="action" value="seed-backlog" />
            <button type="submit" className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-950">
              Seed backlog
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold">Safe local defaults</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {safeDefaults.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded border border-slate-800 px-3 py-2">
              <span className="text-sm text-slate-400">{label}</span>
              <code className="text-xs text-slate-200">{value}</code>
            </div>
          ))}
        </div>
      </div>

      <details className="mt-6 rounded-md border border-slate-800 bg-slate-950">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-100">
          Environment details
        </summary>
        <div className="overflow-x-auto border-t border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Provider label</th>
                <th className="p-3">Required</th>
                <th className="p-3">Status</th>
                <th className="p-3">Where to get it</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((row) => (
                <tr key={row.name}>
                  <td className="p-3 font-mono text-xs text-slate-200">{row.name}</td>
                  <td className="p-3 text-slate-300">{guidance[row.name].providerLabel}</td>
                  <td className="p-3">{row.required ? 'yes' : 'no'}</td>
                  <td className="p-3">
                    <span className={row.present ? 'text-emerald-300' : row.required ? 'text-red-300' : 'text-slate-500'}>
                      {row.present ? 'present' : 'missing'}
                    </span>
                  </td>
                  <td className="p-3 text-slate-400">
                    {guidance[row.name].text}
                    {guidance[row.name].url && (
                      <>
                        {' '}
                        <a
                          href={guidance[row.name].url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-300 underline underline-offset-2 hover:text-sky-200"
                        >
                          {guidance[row.name].linkLabel}
                        </a>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
