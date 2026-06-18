import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'
import { ServiceWorkerRegister } from './sw-register'

export const metadata: Metadata = {
  title: 'Docmee InboxOS',
  description: 'Clinic messaging inbox',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Docmee', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#3b82f6',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
