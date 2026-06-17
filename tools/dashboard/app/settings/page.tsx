const vars = ['TOOLS_DB_URL', 'TOOLS_DB_SERVICE_KEY', 'MONOREPO_ROOT', 'NEXT_PUBLIC_DASHBOARD_PORT', 'DISCORD_BOT_TOKEN', 'DISCORD_CHANNEL_ID', 'GATES_STRICT', 'COST_ALERT_THRESHOLD_USD', 'WEBHOOK_TARGET', 'DEV_LICENSE_SIGNING_KEY']

export default function SettingsPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <table className="mt-5 w-full text-left text-sm"><thead className="bg-slate-900"><tr><th className="p-3">Name</th><th>Required</th><th>Status</th></tr></thead><tbody className="divide-y divide-slate-800">{vars.map((name, index) => <tr key={name}><td className="p-3">{name}</td><td>{index < 4 || name === 'WEBHOOK_TARGET' || name === 'DEV_LICENSE_SIGNING_KEY' ? 'yes' : 'no'}</td><td>masked</td></tr>)}</tbody></table>
    </section>
  )
}
