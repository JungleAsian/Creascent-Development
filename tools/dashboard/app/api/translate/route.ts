import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'

// LLM-backed EN->ES translation with a persistent disk cache. The runtime
// SpanishTranslator sends any UI text its static dictionary did not cover here;
// each unique string is translated once via the configured LLM and cached to
// tools/logs/translations-es.json, so subsequent loads are instant and offline.
// Degrades gracefully (returns the input unchanged) when no LLM key is set.
const toolsRoot = path.resolve(process.cwd(), '..')
const logsRoot = path.join(toolsRoot, 'logs')
const cacheFile = path.join(logsRoot, 'translations-es.json')
const envFile = path.join(toolsRoot, '.env.tools')

function readEnv(): Map<string, string> {
  const values = new Map<string, string>()
  for (const file of [envFile, path.join(toolsRoot, '..', '.env')]) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const idx = trimmed.indexOf('=')
      const key = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
      if (value && !values.has(key)) values.set(key, value)
    }
  }
  return values
}

function loadCache(): Record<string, string> {
  if (!existsSync(cacheFile)) return {}
  try {
    return JSON.parse(readFileSync(cacheFile, 'utf8')) as Record<string, string>
  } catch {
    return {}
  }
}

function saveCache(cache: Record<string, string>) {
  mkdirSync(logsRoot, { recursive: true })
  writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`)
}

// Only translate human-readable UI text — skip data (numbers, hashes, paths,
// URLs, env-style constants) so the toggle never garbles commit hashes/log lines.
function isTranslatable(value: string): boolean {
  const t = value.trim()
  if (t.length < 2 || t.length > 600) return false
  if (!/[A-Za-z]/.test(t)) return false
  if (/^[0-9a-f]{7,40}$/i.test(t)) return false
  if (/^(https?:\/\/|\/|\.\/|~\/|[A-Za-z]:\\)/.test(t)) return false
  if (/^[A-Z0-9_]{3,}$/.test(t) && t.includes('_')) return false
  return true
}

type Engine = { provider: 'openai' | 'anthropic' | 'gemini'; url: string; key: string; model: string }

// Use whichever LLM key is configured in .env.tools (Gemini has a free tier).
function resolveEngine(env: Map<string, string>): Engine | null {
  const deepseek = env.get('DEEPSEEK_API_KEY')
  if (deepseek) {
    const base = (env.get('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com').replace(/\/+$/, '')
    return { provider: 'openai', url: `${base}/chat/completions`, key: deepseek, model: 'deepseek-chat' }
  }
  const openai = env.get('OPENAI_API_KEY')
  if (openai) return { provider: 'openai', url: 'https://api.openai.com/v1/chat/completions', key: openai, model: 'gpt-4o-mini' }
  const anthropic = env.get('ANTHROPIC_API_KEY')
  if (anthropic) return { provider: 'anthropic', url: 'https://api.anthropic.com/v1/messages', key: anthropic, model: 'claude-haiku-4-5-20251001' }
  const gemini = env.get('GOOGLE_GEMINI_API_KEY')
  if (gemini) return { provider: 'gemini', url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${gemini}`, key: gemini, model: 'gemini-2.0-flash' }
  return null
}

async function llmTranslate(strings: string[], engine: Engine): Promise<string[] | null> {
  const prompt = [
    'Translate each English software-dashboard UI string into neutral Latin-American Spanish.',
    'Keep product/proper names unchanged: Docmee, Claude, Codex, Grok, Gemini, Notion, GitHub, Discord, VPS, Redis, Postgres, Supabase, PM2, API, UI, URL, PID.',
    'Keep numbers, %, units, file paths, and placeholders intact.',
    'Return ONLY a JSON array of strings — same length and order as the input, no prose.',
    '',
    `Input: ${JSON.stringify(strings)}`
  ].join('\n')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    let content = ''
    if (engine.provider === 'openai') {
      const response = await fetch(engine.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${engine.key}` },
        body: JSON.stringify({ model: engine.model, temperature: 0, messages: [{ role: 'user', content: prompt }] }),
        signal: controller.signal
      })
      if (!response.ok) return null
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
      content = data.choices?.[0]?.message?.content ?? ''
    } else if (engine.provider === 'anthropic') {
      const response = await fetch(engine.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': engine.key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: engine.model, max_tokens: 8192, messages: [{ role: 'user', content: prompt }] }),
        signal: controller.signal
      })
      if (!response.ok) return null
      const data = await response.json() as { content?: Array<{ text?: string }> }
      content = (data.content ?? []).map((part) => part.text ?? '').join('')
    } else {
      const response = await fetch(engine.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }),
        signal: controller.signal
      })
      if (!response.ok) return null
      const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      content = (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('')
    }
    const match = content.match(/\[[\s\S]*\]/)
    if (!match) return null
    const parsed = JSON.parse(match[0]) as unknown
    if (!Array.isArray(parsed) || parsed.length !== strings.length) return null
    return parsed.map((item) => (typeof item === 'string' ? item : ''))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request: Request) {
  let strings: string[] = []
  try {
    const body = await request.json() as { strings?: unknown }
    if (Array.isArray(body.strings)) strings = body.strings.filter((s): s is string => typeof s === 'string')
  } catch {
    return NextResponse.json({})
  }

  const unique = [...new Set(strings.map((s) => s.trim()).filter(isTranslatable))]
  const cache = loadCache()
  const misses = unique.filter((s) => !(s in cache))

  if (misses.length > 0) {
    const engine = resolveEngine(readEnv())
    if (engine) {
      let changed = false
      for (let i = 0; i < misses.length; i += 40) {
        const chunk = misses.slice(i, i + 40)
        const out = await llmTranslate(chunk, engine)
        if (!out) break
        chunk.forEach((source, index) => {
          const translated = out[index]?.trim()
          if (translated) { cache[source] = translated; changed = true }
        })
      }
      if (changed) saveCache(cache)
    }
  }

  const result: Record<string, string> = {}
  for (const source of unique) result[source] = cache[source] ?? source
  return NextResponse.json(result)
}
