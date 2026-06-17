import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ ok: true, output: 'Run `pnpm tool gates check` from /tools for full gate output.' })
}
