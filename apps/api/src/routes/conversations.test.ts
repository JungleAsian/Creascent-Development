import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// buildApp wires every route; stub the workspace deps so no real Redis/DB/Google loads.
vi.mock('@docmee/queue', () => ({
  whatsappInboundQueue: { add: vi.fn() },
  kbEmbedQueue: { add: vi.fn() },
}))
vi.mock('@docmee/agents', () => ({ getOAuth2Client: () => ({}) }))
vi.mock('@docmee/shared', () => ({
  encryptValue: (v: string) => `enc:${v}`,
  verifyPassword: () => true,
}))

const store = vi.hoisted(() => ({
  // One closed conversation that reopen() should clone into a brand-new row.
  conversations: new Map<string, Record<string, unknown>>([
    [
      'old-1',
      {
        id: 'old-1',
        clinicId: 'c-1',
        patientId: 'p-1',
        channel: 'whatsapp',
        channelContactHandle: '+50212345678',
        status: 'resolved',
        assignedTo: null,
        iaProfileId: 'ia-1',
      },
    ],
  ]),
  created: [] as Record<string, unknown>[],
}))

vi.mock('@docmee/db', () => ({
  createServiceDbClient: () => ({ end: async () => {} }),
  createConversationsRepository: () => ({
    listByClinic: async (clinicId: string) =>
      [...store.conversations.values()].filter((c) => c.clinicId === clinicId),
    findById: async (clinicId: string, id: string) => {
      const c = store.conversations.get(id)
      return c && c.clinicId === clinicId ? c : null
    },
    create: async (data: Record<string, unknown>) => {
      const row = { ...data, id: `new-${store.created.length + 1}`, status: 'open' }
      store.created.push(row)
      return row
    },
  }),
  createMessagesRepository: () => ({}),
  createClinicsRepository: () => ({}),
  createPatientsRepository: () => ({}),
  createKnowledgeRepository: () => ({}),
  createNotificationsRepository: () => ({}),
  createUsersRepository: () => ({}),
}))

import { buildApp } from '../app.js'
import { signAccessToken } from '../auth/jwt.js'

const token = signAccessToken({ userId: 'u-1', clinicId: 'c-1', role: 'clinic_admin', email: 'a@demo.test' })
const auth = { authorization: `Bearer ${token}` }

describe('conversation routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test'
    app = await buildApp()
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  it('GET /conversations without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/conversations' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /conversations with auth → 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/conversations', headers: auth })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.conversations).toHaveLength(1)
    expect(body.conversations[0].id).toBe('old-1')
  })

  it('POST /conversations/:id/reopen creates a NEW conversation (Decision 4)', async () => {
    const res = await app.inject({ method: 'POST', url: '/conversations/old-1/reopen', headers: auth })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    // A fresh conversation, not the original being flipped back to open.
    expect(body.conversation.id).not.toBe('old-1')
    expect(body.conversation.channelContactHandle).toBe('+50212345678')
    expect(body.conversation.metadata).toEqual({ reopenedFrom: 'old-1' })
    expect(store.created).toHaveLength(1)
  })
})
