import './globals.css'
import type { ReactNode } from 'react'
import { DashboardShell } from './shell'

const nav = [
  ['Backlog', '/backlog'],
  ['Ready', '/ready'],
  ['Build Control', '/build-control'],
  ['Install Monitor', '/install-monitor'],
  ['Claude Switch', '/claude-switch'],
  ['Six Gates', '/gates'],
  ['Phase Progress', '/phases'],
  ['Development Cost', '/cost'],
  ['Stack Intelligence', '/stack'],
  ['Sentinel', '/sentinel'],
  ['Diagnostics', '/diagnostics'],
  ['Agents', '/agents'],
  ['Logs', '/logs'],
  ['Webhook Console', '/webhooks'],
  ['Seed Generator', '/seed'],
  ['Discord Status', '/discord'],
  ['Post-Deployment Log', '/post-deployment'],
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
