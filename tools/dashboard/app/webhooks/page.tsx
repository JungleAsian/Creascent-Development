const payloads = ['text-message', 'voice-note', 'new-patient', 'returning-patient', 'emergency', 'booking-request', 'reschedule-request', 'cancel-request', 'stop-optout']

type PageProps = { searchParams?: { message?: string; error?: string } }

export default function WebhooksPage({ searchParams }: PageProps) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">Webhook Console</h1>
      {searchParams?.message && <p className="mt-2 text-sm text-emerald-300">{searchParams.message}</p>}
      {searchParams?.error && <p className="mt-2 text-sm text-red-300">{searchParams.error}</p>}
      <form action="/api/actions" method="post" className="mt-5 grid gap-4">
        <input type="hidden" name="action" value="webhook-send" />
        <select name="payload" className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2">{payloads.map((payload) => <option key={payload}>{payload}</option>)}</select>
        <textarea name="body" className="min-h-72 rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-sm" defaultValue={'{\n  "object": "whatsapp_business_account"\n}'} />
        <button className="w-fit rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950">Send</button>
      </form>
    </section>
  )
}
