import './globals.css'
import type { ReactNode } from 'react'
import { DashboardShell } from './shell'

const nav = [
  ['Backlog', '/backlog'],
  ['Ready', '/ready'],
  ['Build Control', '/build-control'],
  ['Six Gates', '/gates'],
  ['Phase Progress', '/phases'],
  ['API Cost', '/cost'],
  ['Diagnostics', '/diagnostics'],
  ['Agents', '/agents'],
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
        <DashboardShell nav={nav}>{children}</DashboardShell>
      </body>
    </html>
  )
}
