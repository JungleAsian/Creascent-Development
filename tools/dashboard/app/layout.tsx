import './globals.css'
import type { ReactNode } from 'react'
import { DashboardShell } from './shell'

const nav = [
  ['Ready', '/ready'],
  ['Backlog', '/backlog'],
  ['Features Development', '/rev1-coverage'],
  ['Docmee Deployment', '/docmee-deployment'],
  ['Frontend Build Control', '/frontend-build-control'],
  ['Enhancements', '/enhancements'],
  ['Codex Switch', '/codex-switch'],
  ['Claude Switch', '/claude-switch'],
  ['Build Control', '/build-control'],
  ['Phase Progress', '/phases'],
  ['Six Gates', '/gates'],
  ['Post-Deployment Log', '/post-deployment'],
  ['Pre-deployment', '/predeployment'],
  ['Docmee Update', '/docmee-update'],
  ['Deploy', '/deploy'],
  ['Install Monitor', '/install-monitor'],
  ['Sentinel', '/sentinel'],
  ['Forge', '/forge'],
  ['Guardian', '/guardian'],
  ['Aegis', '/aegis'],
  ['Cortex', '/cortex'],
  ['Diagnostics', '/diagnostics'],
  ['Logs', '/logs'],
  ['Discord Status', '/discord'],
  ['Development Cost', '/cost'],
  ['Stack Intelligence', '/stack'],
  ['Agents', '/agents'],
  ['Webhook Console', '/webhooks'],
  ['Seed Generator', '/seed'],
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
