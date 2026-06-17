import fs from 'node:fs'
import os from 'node:os'
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

const groups = [
  {
    title: 'DevTools Database',
    rows: [
      ['TOOLS_DB_URL', 'Supabase: API URL', 'Supabase local start output. Usually http://localhost:54321.', 'https://supabase.com/docs/guides/local-development/cli/getting-started'],
      ['TOOLS_DB_SERVICE_KEY', 'Supabase: service_role key', 'Supabase local start output. Use the local service_role key only.', 'https://supabase.com/docs/guides/local-development/cli/getting-started'],
      ['MONOREPO_ROOT', 'Docmee repo root', 'Repo layout. Keep ../ when DevTools lives in /tools.'],
      ['NEXT_PUBLIC_DASHBOARD_PORT', 'Docmee dashboard port', 'Dashboard port. Keep 4000 unless another local service uses it.']
    ]
  },
  {
    title: 'Discord Notifications',
    rows: [
      ['DISCORD_BOT_TOKEN', 'Discord: Bot Token', 'Fallback Discord bot token.', 'https://discord.com/developers/applications'],
      ['DISCORD_MESSAGING_BOT_TOKEN', 'Discord: Messaging Bot Token', 'Dedicated DevTools messaging bot token.', 'https://discord.com/developers/applications'],
      ['DISCORD_CHANNEL_ID', 'Discord: Channel ID', 'Fallback Discord channel ID.', 'https://support.discord.com/hc/en-us/articles/206346498'],
      ['DISCORD_CRITICAL_CHANNEL_ID', 'Discord: Critical/Important Channel ID', 'Optional channel for failed gates, deploy failures, and cost alerts.', 'https://support.discord.com/hc/en-us/articles/206346498'],
      ['DISCORD_UPDATE_CHANNEL_ID', 'Discord: Development Updates Channel ID', 'Optional channel for gate passes and phase completion.', 'https://support.discord.com/hc/en-us/articles/206346498'],
      ['DISCORD_APPROVAL_CHANNEL_ID', 'Discord: Approval Channel ID', 'Optional channel for approval requests.', 'https://support.discord.com/hc/en-us/articles/206346498']
    ]
  },
  {
    title: 'Notion Prompt Sync',
    rows: [
      ['NOTION_API_KEY', 'Notion: Internal Integration Token', 'Create a Notion integration with read content permission.', 'https://www.notion.so/my-integrations'],
      ['NOTION_PROMPTS_DB_ID', 'Notion: Phase Prompts Page ID', 'The 32-character ID from the Phase Prompts page URL.']
    ]
  },
  {
    title: 'AI Providers',
    rows: [
      ['ANTHROPIC_API_KEY', 'Anthropic: API Key', 'Claude API key.', 'https://console.anthropic.com/api-keys'],
      ['OPENAI_API_KEY', 'OpenAI: API Key', 'Codex Pro, GPT-4o, and OpenAI-compatible agent key.', 'https://platform.openai.com/api-keys'],
      ['OPENAI_EMBEDDING_KEY', 'OpenAI: API Key', 'Embeddings key. Use OPENAI_EMBEDDING_KEY, not OPENAI_API_KEY.', 'https://platform.openai.com/api-keys'],
      ['GOOGLE_GEMINI_API_KEY', 'Google AI Studio: API Key', 'Gemini agent key.', 'https://aistudio.google.com/app/apikey'],
      ['MISTRAL_API_KEY', 'Mistral: API Key', 'Mistral and Codestral agent key.', 'https://console.mistral.ai/api-keys'],
      ['CUSTOM_AI_API_KEY', 'Custom AI: API Key', 'Optional OpenAI-compatible custom provider key.'],
      ['CUSTOM_AI_BASE_URL', 'Custom AI: Base URL', 'Optional OpenAI-compatible custom provider endpoint.'],
      ['CUSTOM_AI_MODEL', 'Custom AI: Model', 'Optional custom model name.'],
      ['DEEPSEEK_API_KEY', 'DeepSeek: API Key', 'DeepSeek platform API key.', 'https://platform.deepseek.com/api_keys'],
      ['DEEPSEEK_BASE_URL', 'DeepSeek: Base URL', 'Default https://api.deepseek.com.']
    ]
  },
  {
    title: 'Voice, Email, Calendar, Meta',
    rows: [
      ['DEEPGRAM_API_KEY', 'Deepgram: API Key', 'Voice transcription provider key.', 'https://console.deepgram.com'],
      ['RESEND_API_KEY', 'Resend: API Key', 'Email provider key.', 'https://resend.com/api-keys'],
      ['EMAIL_FROM', 'Resend: From Email', 'Verified sender address in Resend.'],
      ['GOOGLE_CLIENT_ID', 'Google Cloud: OAuth Client ID', 'Calendar OAuth client ID.', 'https://console.cloud.google.com/apis/credentials'],
      ['GOOGLE_CLIENT_SECRET', 'Google Cloud: OAuth Client Secret', 'Calendar OAuth client secret.', 'https://console.cloud.google.com/apis/credentials'],
      ['GOOGLE_REDIRECT_URI', 'Google Cloud: Authorized Redirect URI', 'Local or production OAuth redirect URI.', 'https://console.cloud.google.com/apis/credentials'],
      ['META_APP_SECRET', 'Meta: App Secret', 'WhatsApp app secret.', 'https://developers.facebook.com'],
      ['META_VERIFY_TOKEN', 'Meta: Verify Token', 'Webhook verification token.', 'https://developers.facebook.com'],
      ['WHATSAPP_DEFAULT_ACCESS_TOKEN', 'Meta: WhatsApp Access Token', 'Default local/dev WhatsApp access token.', 'https://developers.facebook.com']
    ]
  },
  {
    title: 'Runtime, Auth, License, GitHub',
    rows: [
      ['REDIS_URL', 'Redis: Connection URL', 'Default redis://localhost:6379.'],
      ['JWT_SECRET', 'Auth: JWT Secret', 'Generate with openssl rand -hex 32.'],
      ['JWT_REFRESH_SECRET', 'Auth: JWT Refresh Secret', 'Generate with openssl rand -hex 32.'],
      ['LICENSE_SERVER_URL', 'LicenseKit: Server URL', 'License server URL for deployed environments.'],
      ['LICENSE_PUBLIC_KEY', 'LicenseKit: Public Key', 'License verification public key.'],
      ['GITHUB_TOKEN', 'GitHub: Personal Access Token', 'Token for deployment and installer workflows.', 'https://github.com/settings/tokens'],
      ['GITHUB_ORG', 'GitHub: Organization', 'GitHub org or owner.'],
      ['APP_URL', 'Docmee: App URL', 'Default http://localhost:3000.'],
      ['APP_VERSION', 'Docmee: App Version', 'Version used in deploy checks.'],
      ['API_PORT', 'Docmee: API Port', 'Default 3001.'],
      ['NODE_ENV', 'Node: Environment', 'development for local setup.'],
      ['LLM_STUB', 'Docmee: LLM Stub Mode', 'Use true for local safe testing.'],
      ['SERVER_ID', 'Docmee: Server ID', 'Unique environment label.']
    ]
  },
  {
    title: 'Deployment',
    rows: [
      ['VPS_HOST', 'Hostinger: VPS Host', 'Hostinger KVM IP address.'],
      ['VPS_USER', 'Hostinger: SSH User', 'Usually root during setup.'],
      ['VPS_SSH_KEY_PATH', 'SSH: Private Key Path', 'Default ~/.ssh/id_ed25519.'],
      ['VPS_DEPLOY_PATH', 'Hostinger: Deploy Path', 'Default /var/www/docmee.'],
      ['VPS_DOMAIN', 'Hostinger: Domain', 'Domain routed to the VPS.'],
      ['ENV_PRODUCTION_PATH', 'Docmee: Production Env Path', 'Path to .env.production for secure sync.'],
      ['GITHUB_REPO', 'GitHub: Repository SSH URL', 'Repo used by VPS git pull deployment.'],
      ['GITHUB_BRANCH', 'GitHub: Deploy Branch', 'Usually main.'],
      ['PM2_ECOSYSTEM_FILE', 'PM2: Ecosystem File', 'Default ecosystem.config.cjs.']
    ]
  },
  {
    title: 'DevTools Controls',
    rows: [
      ['GATES_STRICT', 'Docmee gate strictness', 'Keep false during early setup.'],
      ['COST_ALERT_THRESHOLD_USD', 'Docmee cost alert threshold', 'Daily local cost alert threshold.'],
      ['WEBHOOK_TARGET', 'Docmee local webhook URL', 'Local API webhook route.'],
      ['DEV_LICENSE_SIGNING_KEY', 'Docmee dev signing key', 'Local-only signing secret.']
    ]
  }
] as const

const safeDefaults = [
  ['Supabase: API URL', 'http://localhost:54321'],
  ['Docmee repo root', '../'],
  ['Docmee dashboard port', '4000'],
  ['Docmee local webhook URL', 'http://localhost:3001/webhook/whatsapp'],
  ['Redis URL', 'redis://localhost:6379'],
  ['DeepSeek base URL', 'https://api.deepseek.com'],
  ['Node environment', 'development']
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

function localIp() {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const item of interfaces ?? []) {
      if (item.family === 'IPv4' && !item.internal) return item.address
    }
  }
  return '127.0.0.1'
}

type SettingsPageProps = { searchParams?: { message?: string; error?: string } }

export default function SettingsPage({ searchParams }: SettingsPageProps) {
  const envExists = fs.existsSync(envFile)
  const exampleExists = fs.existsSync(envExampleFile)
  const env = envExists ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {}
  const backlogCount = fs.existsSync(backlogFile) ? JSON.parse(fs.readFileSync(backlogFile, 'utf8')).length as number : 0
  const allRows = groups.flatMap((group) => group.rows.map(([name]) => name))
  const missingRequired = requiredVars.filter((name) => !env[name])
  const networkUrl = `http://${localIp()}:4000`

  return (
    <section className="max-w-6xl">
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
                <button type="submit" disabled={!exampleExists} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-700">Create .env.tools</button>
              </form>
            )}
            <form action="/api/settings/env" method="post">
              <input type="hidden" name="action" value="open" />
              <button type="submit" disabled={!envExists} className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">Open .env.tools</button>
            </form>
            <form action="/api/settings/env" method="post">
              <input type="hidden" name="action" value="check" />
              <button type="submit" className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white">Run setup check</button>
            </form>
          </div>
          {searchParams?.message && <p className="text-right text-xs text-emerald-300">{searchParams.message}</p>}
          {searchParams?.error && <p className="text-right text-xs text-red-300">{searchParams.error}</p>}
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Configuration file</h2><p className={envExists ? 'mt-2 text-sm text-emerald-300' : 'mt-2 text-sm text-amber-300'}>{envExists ? 'Ready' : 'Missing'}</p></div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Required settings</h2><p className={missingRequired.length === 0 ? 'mt-2 text-sm text-emerald-300' : 'mt-2 text-sm text-red-300'}>{missingRequired.length === 0 ? 'Ready' : `${missingRequired.length} missing`}</p></div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Backlog</h2><p className={backlogCount === 45 ? 'mt-2 text-sm text-emerald-300' : 'mt-2 text-sm text-amber-300'}>{backlogCount}/45 tasks</p></div>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><h2 className="text-sm font-semibold">Credential fields</h2><p className="mt-2 text-sm text-slate-300">{allRows.length} tracked</p></div>
      </div>

      <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Network Access</h2>
            <p className="mt-1 text-sm text-slate-400">Use this only on your private local network. Never expose DevTools to the internet.</p>
          </div>
          <div className="flex gap-2">
            <form action="/api/actions" method="post"><input type="hidden" name="action" value="deploy-web" /><button className="rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">Show QR</button></form>
            <form action="/api/actions" method="post"><input type="hidden" name="action" value="deploy-web-stop" /><button className="rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">Stop Web</button></form>
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="rounded border border-slate-800 px-3 py-2"><span className="text-sm text-slate-400">Local URL</span><p className="mt-1 text-sm text-slate-200">http://localhost:4000</p></div>
          <div className="rounded border border-slate-800 px-3 py-2"><span className="text-sm text-slate-400">Network URL</span><p className="mt-1 text-sm text-sky-300">{networkUrl}</p></div>
          <div className="rounded border border-slate-800 px-3 py-2"><span className="text-sm text-slate-400">Bind address</span><p className="mt-1 text-sm text-emerald-300">0.0.0.0</p></div>
          <div className="rounded border border-slate-800 px-3 py-2"><span className="text-sm text-slate-400">Firewall</span><p className="mt-1 text-sm text-amber-300">Allow inbound TCP 4000 on private networks</p></div>
        </div>
      </div>

      <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-semibold">Backlog setup</h2><p className="mt-1 text-sm text-slate-400">Seed the local DevTools backlog if it is not ready.</p></div>
          <form action="/api/settings/env" method="post"><input type="hidden" name="action" value="seed-backlog" /><button type="submit" className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-950">Seed backlog</button></form>
        </div>
      </div>

      <div className="mt-6 rounded-md border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold">Safe local defaults</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {safeDefaults.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded border border-slate-800 px-3 py-2"><span className="text-sm text-slate-400">{label}</span><code className="text-xs text-slate-200">{value}</code></div>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {groups.map((group) => (
          <details key={group.title} className="rounded-md border border-slate-800 bg-slate-950">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-100">{group.title}</summary>
            <div className="overflow-x-auto border-t border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900"><tr><th className="p-3">Name</th><th className="p-3">Provider label</th><th className="p-3">Required</th><th className="p-3">Status</th><th className="p-3">Where to get it</th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {group.rows.map(([name, label, text, url]) => {
                    const required = requiredVars.includes(name)
                    const present = Boolean(env[name])
                    return (
                      <tr key={name}>
                        <td className="p-3 font-mono text-xs text-slate-200">{name}</td>
                        <td className="p-3 text-slate-300">{label}</td>
                        <td className="p-3">{required ? 'yes' : 'no'}</td>
                        <td className="p-3"><span className={present ? 'text-emerald-300' : required ? 'text-red-300' : 'text-slate-500'}>{present ? 'present' : 'missing'}</span></td>
                        <td className="p-3 text-slate-400">{text}{url && <> <a href={url} target="_blank" rel="noreferrer" className="text-sky-300 underline underline-offset-2 hover:text-sky-200">Open setup</a></>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
