'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Props = {
  envExists: boolean
  exampleExists: boolean
}

export default function SettingsActions({ envExists, exampleExists }: Props) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(action: 'create' | 'open') {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/settings/env', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action })
      })
      const result = await response.json() as { message?: string; error?: string }
      setMessage(result.message ?? result.error ?? 'Done')
      router.refresh()
    } catch {
      setMessage('Settings action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-w-72 flex-col items-end gap-2">
      <div className="flex gap-2">
        {!envExists && (
          <button
            type="button"
            disabled={!exampleExists || busy}
            onClick={() => void run('create')}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            Create .env.tools
          </button>
        )}
        <button
          type="button"
          disabled={!envExists || busy}
          onClick={() => void run('open')}
          className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          Open .env.tools
        </button>
      </div>
      {message && <p className="text-right text-xs text-slate-400">{message}</p>}
    </div>
  )
}
