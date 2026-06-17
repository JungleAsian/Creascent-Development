import './globals.css'
import Link from 'next/link'
import type { ReactNode } from 'react'

const nav = [
  ['Backlog', '/backlog'],
  ['Six Gates', '/gates'],
  ['Phase Progress', '/phases'],
  ['API Cost', '/cost'],
  ['Logs', '/logs'],
  ['Webhook Console', '/webhooks'],
  ['Seed Generator', '/seed'],
  ['Discord Status', '/discord'],
  ['Deploy', '/deploy'],
  ['Settings', '/settings']
]

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen bg-slate-950 text-slate-100">
          <aside className="w-64 border-r border-slate-800 bg-slate-900 p-5">
            <Link href="/" className="mb-8 block text-xl font-semibold">Docmee DevTools</Link>
            <nav className="space-y-1">
              {nav.map(([label, href]) => (
                <Link key={href} href={href} className="block rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">
                  {label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="flex-1 overflow-auto p-8">{children}</main>
        </div>
      </body>
    </html>
  )
}
