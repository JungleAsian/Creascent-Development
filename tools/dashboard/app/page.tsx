import Link from 'next/link'

const cards = [
  ['Backlog', '/backlog', 'Track the 45 DevTools gaps.'],
  ['Gates', '/gates', 'Run typecheck, lint, DAL, env, RLS, and tests.'],
  ['Webhooks', '/webhooks', 'Send local WhatsApp payloads with HMAC signatures.'],
  ['Settings', '/settings', 'Review local .env.tools status.']
]

export default function Page() {
  return (
    <section>
      <h1 className="text-3xl font-semibold">Docmee DevTools</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {cards.map(([title, href, body]) => (
          <Link key={href} href={href} className="rounded-lg border border-slate-800 bg-slate-900 p-5 hover:border-cyan-500">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-slate-400">{body}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
