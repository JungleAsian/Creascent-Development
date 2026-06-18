import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { createHmac } from 'node:crypto'

const { add } = vi.hoisted(() => ({ add: vi.fn() }))
vi.mock('@docmee/queue', () => ({ whatsappInboundQueue: { add } }))

import { buildApp } from '../app.js'

const SECRET = 'webhook-secret'
const VERIFY = 'verify-token'

const validPayload = JSON.stringify({
  object: 'page',
  entry: [
    {
      id: 'PAGE_ID',
      time: 1700000000000,
      messaging: [
        {
          sender: { id: 'PSID_123' },
          recipient: { id: 'PAGE_ID' },
          timestamp: 1700000000000,
          message: { mid: 'mid.ABC', text: 'hola' },
        },
      ],
    },
  ],
})

const sign = (b: string) => `sha256=${createHmac('sha256', SECRET).update(Buffer.from(b)).digest('hex')}`
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('messenger webhook routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test'
    process.env['META_APP_SECRET'] = SECRET
    process.env['META_VERIFY_TOKEN'] = VERIFY
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    add.mockClear()
  })

  it('GET verification with the correct token returns 200 + challenge', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/webhook/messenger?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=99`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('99')
  })

  it('GET verification with a wrong token returns 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/webhook/messenger?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=99',
    })
    expect(res.statusCode).toBe(403)
  })

  it('POST with an invalid HMAC returns 200 but does not enqueue', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/messenger',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=bad' },
      payload: validPayload,
    })
    await flush()
    expect(res.statusCode).toBe(200)
    expect(add).not.toHaveBeenCalled()
  })

  it('POST with a valid payload + HMAC returns 200 and enqueues a messenger job', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/messenger',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(validPayload) },
      payload: validPayload,
    })
    await flush()
    expect(res.statusCode).toBe(200)
    expect(add).toHaveBeenCalledTimes(1)
    const [name, job] = add.mock.calls[0] as [string, Record<string, unknown>]
    expect(name).toBe('inbound')
    expect(job['channel']).toBe('messenger')
    expect(job['phoneNumberId']).toBe('PAGE_ID')
    expect(job['patientWaId']).toBe('PSID_123')
    expect(job['messageType']).toBe('text')
    expect(job['content']).toBe('hola')
    expect(job['waMessageId']).toBe('mid.ABC')
  })

  it('POST ignores message echoes (our own outbound)', async () => {
    const echo = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: 'PAGE_ID',
          messaging: [
            {
              sender: { id: 'PAGE_ID' },
              recipient: { id: 'PSID_123' },
              message: { mid: 'mid.echo', text: 'hola', is_echo: true },
            },
          ],
        },
      ],
    })
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/messenger',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(echo) },
      payload: echo,
    })
    await flush()
    expect(res.statusCode).toBe(200)
    expect(add).not.toHaveBeenCalled()
  })
})
