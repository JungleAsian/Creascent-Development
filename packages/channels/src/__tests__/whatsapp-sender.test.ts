import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendWhatsAppText } from '../whatsapp-sender.js'

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('sendWhatsAppText', () => {
  it('POSTs a text message to the Graph API with auth + body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await sendWhatsAppText('PHONE_ID', 'TOKEN', '5215555555555', 'hola')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/PHONE_ID/messages')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN')
    const body = JSON.parse(init.body as string) as { to: string; text: { body: string }; type: string }
    expect(body.to).toBe('5215555555555')
    expect(body.type).toBe('text')
    expect(body.text.body).toBe('hola')
  })

  it('throws when the Graph API responds with an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(sendWhatsAppText('PHONE_ID', 'BAD', '521', 'hi')).rejects.toThrow(/401/)
  })
})
