// Compact inline-SVG nav icons (stroke, inherits currentColor). Kept local to the
// app so the side rail can show a glyph per item without pulling an icon library.
const PATHS: Record<string, string> = {
  clinics: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h.01M9 11h.01M9 15h.01M15 7h.01M15 11h.01M15 15h.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  doctors: 'M6 3v5a5 5 0 0 0 10 0V3M6 3H3M16 3h3M11 13v3a4 4 0 0 0 8 0v-1M19 13a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  channels: 'M4.93 19.07a10 10 0 0 1 0-14.14M19.07 4.93a10 10 0 0 1 0 14.14M7.76 16.24a6 6 0 0 1 0-8.48M16.24 7.76a6 6 0 0 1 0 8.48M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  quickReplies: 'M21 11.5a8.5 8.5 0 0 1-12.1 7.7L3 21l1.9-5.9A8.5 8.5 0 1 1 21 11.5zM8 12h.01M12 12h.01M16 12h.01',
  templates: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h2',
  automations: 'M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16',
  kb: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  customFlows: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  errors: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  usage: 'M3 3v18h18M7 16v-5M12 16V8M17 16v-3',
  license: 'M15 7a4 4 0 1 1-4.9 3.9L4 17v3h3l1-1h2l1-1v-2l2-2A4 4 0 0 1 15 7zM18 6h.01',
  compliance: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
}

export type NavIconName = keyof typeof PATHS

export function NavIcon({ name, className = 'h-4 w-4' }: { name: NavIconName | string; className?: string }) {
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}
