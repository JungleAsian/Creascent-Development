import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const form = await request.formData()
  return NextResponse.json({ ok: true, payload: form.get('payload'), status: 'queued for local send' })
}
