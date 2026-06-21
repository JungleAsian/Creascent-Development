import './globals.css'
import type { ReactNode } from 'react'
import type { NavItem } from './shell'
import { DashboardShell } from './shell'
import { FormSubmitFeedback } from './form-submit-feedback'

const nav: NavItem[] = [
  ['Workflow', '/workflow'],
  ['Ready', '/ready'],
  ['Backlog', '/backlog'],
  ['Features Development', '/rev1-coverage'],
  ['Docmee - UI', '/docmee-audit'],
  ['Docmee Deployment', '/docmee-deployment'],
  ['Frontend Build Control', '/frontend-build-control'],
  ['Enhancements', '/enhancements'],
  ['Claude', '/claude-switch'],
  ['Codex', '/codex-switch'],
  ['Grok', '/grok'],
  ['Gemini', '/gemini'],
  ['Build Control', '/build-control'],
  ['Phase Progress', '/phases'],
  ['Six Gates', '/gates'],
  ['Post-Deployment Log', '/post-deployment'],
  ['Pre-deployment', '/predeployment'],
  ['Docmee Update', '/docmee-update'],
  ['Deploy', '/deploy'],
  ['Install Monitor', '/install-monitor'],
  ['Sentinel', '/sentinel'],
  ['Healer', '/healer'],
  ['Beacon', '/beacon'],
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
        <FormSubmitFeedback />
        <DashboardShell nav={nav}>{children}</DashboardShell>
      </body>
    </html>
  )
}
