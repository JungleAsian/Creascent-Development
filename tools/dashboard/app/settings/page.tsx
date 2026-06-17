import fs from 'node:fs'
import path from 'node:path'
import SettingsActions from './settings-actions'

const toolsRoot = path.resolve(process.cwd(), '..')
const envFile = path.join(toolsRoot, '.env.tools')
const envExampleFile = path.join(toolsRoot, '.env.tools.example')

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

const guidance: Record<string, { text: string; url?: string; label?: string }> = {
  TOOLS_DB_URL: {
    text: 'Supabase local start output. Usually http://localhost:54321.',
    url: 'https://supabase.com/docs/guides/local-development/cli/getting-started',
    label: 'Supabase local CLI docs'
  },
  TOOLS_DB_SERVICE_KEY: {
    text: 'Supabase local start output. Use the local service_role key only.',
    url: 'https://supabase.com/docs/guides/local-development/cli/getting-started',
    label: 'Supabase local CLI docs'
  },
  MONOREPO_ROOT: { text: 'Repo layout. Keep ../ when DevTools lives in /tools.' },
  NEXT_PUBLIC_DASHBOARD_PORT: { text: 'Dashboard port. Keep 4000 unless another local service uses it.' },
  WEBHOOK_TARGET: { text: 'Local API webhook route. Change only if your local API uses a different port/path.' },
  DEV_LICENSE_SIGNING_KEY: { text: 'Local-only signing secret. Use a long random development string.' },
  DISCORD_BOT_TOKEN: {
    text: 'Discord developer portal bot token. Leave blank until notifications are configured.',
    url: 'https://discord.com/developers/applications',
    label: 'Discord developer portal'
  },
  DISCORD_CHANNEL_ID: {
    text: 'Discord channel ID for DevTools notifications. Leave blank until Discord is configured.',
    url: 'https://support.discord.com/hc/en-us/articles/206346498',
    label: 'Discord ID guide'
  },
  GATES_STRICT: { text: 'Local gate behavior. Keep false during early setup.' },
  COST_ALERT_THRESHOLD_USD: { text: 'Your daily local cost alert limit, such as 10.' }
}

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

export default function SettingsPage() {
  const envExists = fs.existsSync(envFile)
  const exampleExists = fs.existsSync(envExampleFile)
  const env = envExists ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {}
  const rows = [
    ...requiredVars.map((name) => ({ name, required: true, present: Boolean(env[name]) })),
    ...optionalVars.map((name) => ({ name, required: false, present: Boolean(env[name]) }))
  ]

  return (
    <section className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-2 text-sm text-slate-400">{envExists ? envFile : '.env.tools has not been created yet'}</p>
        </div>
        <SettingsActions envExists={envExists} exampleExists={exampleExists} />
      </div>

      <table className="mt-5 w-full text-left text-sm">
        <thead className="bg-slate-900">
          <tr>
            <th className="p-3">Name</th>
            <th className="p-3">Required</th>
            <th className="p-3">Status</th>
            <th className="p-3">Where to get it</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="p-3 font-mono text-xs text-slate-200">{row.name}</td>
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
                      {guidance[row.name].label}
                    </a>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
