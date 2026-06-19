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
  // A closed conversation reopen() should clone, an open one to assign, and two
  // already-assigned to different users (for the assigned_to filter test).
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
    [
      'open-1',
      {
        id: 'open-1',
        clinicId: 'c-1',
        channel: 'whatsapp',
        channelContactHandle: '+50211112222',
        status: 'open',
        assignedTo: null,
        metadata: {},
      },
    ],
    [
      'mine-1',
      {
        id: 'mine-1',
        clinicId: 'c-1',
        channel: 'whatsapp',
        channelContactHandle: '+50233334444',
        status: 'assigned',
        assignedTo: 'u-2',
        metadata: {},
      },
    ],
    [
      'theirs-1',
      {
        id: 'theirs-1',
        clinicId: 'c-1',
        channel: 'whatsapp',
        channelContactHandle: '+50255556666',
        status: 'assigned',
        assignedTo: 'u-3',
        metadata: {},
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
    update: async (clinicId: string, id: string, patch: Record<string, unknown>) => {
      const c = store.conversations.get(id)
      if (!c || c.clinicId !== clinicId) return null
      const updated = { ...c, ...patch }
      store.conversations.set(id, updated)
      return updated
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

const tokenFor = (role: 'clinic_admin' | 'secretary' | 'doctor' | 'ia_studio_admin', userId = 'u-1') =>
  signAccessToken({ userId, clinicId: 'c-1', role, email: `${role}@demo.test` })
const authHeader = (role: Parameters<typeof tokenFor>[0], userId?: string) => ({
  authorization: `Bearer ${tokenFor(role, userId)}`,
})
const auth = authHeader('clinic_admin')

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

  it('GET /conversations with auth → 200 (all clinic conversations)', async () => {
    const res = await app.inject({ method: 'GET', url: '/conversations', headers: auth })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.conversations.map((c: { id: string }) => c.id)).toEqual(
      expect.arrayContaining(['old-1', 'open-1', 'mine-1', 'theirs-1']),
    )
  })

  // ── Assigned conversation views (Rev1 #12) ──
  it('GET /conversations?assigned_to=… returns only that user\'s conversations', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/conversations?assigned_to=u-2',
      headers: auth,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.conversations).toHaveLength(1)
    expect(body.conversations[0].id).toBe('mine-1')
  })

  // ── Assignment role permissions (Rev1 #12) ──
  // secretary, doctor and clinic_admin may assign; ia_studio_admin (platform
  // super-admin, not a clinic-inbox role) may not — mirroring /messages, /status
  // and /resume-bot.
  it.each(['secretary', 'doctor', 'clinic_admin'] as const)(
    'POST /conversations/:id/assign as %s → 200 and assigns',
    async (role) => {
      const res = await app.inject({
        method: 'POST',
        url: '/conversations/open-1/assign',
        headers: authHeader(role, `actor-${role}`),
        payload: { userId: 'u-2' },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.conversation.assignedTo).toBe('u-2')
      expect(body.conversation.status).toBe('assigned')
    },
  )

  it('POST /conversations/:id/assign as ia_studio_admin → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/open-1/assign',
      headers: authHeader('ia_studio_admin'),
      payload: { userId: 'u-2' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('POST /conversations/:id/assign without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/open-1/assign',
      payload: { userId: 'u-2' },
    })
    expect(res.statusCode).toBe(401)
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
