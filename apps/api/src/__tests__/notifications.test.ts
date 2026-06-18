import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'

// buildApp also wires the webhook (queue) and calendar (agents/shared) routes;
// stub their workspace deps so no real Redis/Google/crypto loads here.
vi.mock('@docmee/queue', () => ({ whatsappInboundQueue: { add: vi.fn() } }))
vi.mock('@docmee/agents', () => ({ getOAuth2Client: () => ({}) }))
vi.mock('@docmee/shared', () => ({ encryptValue: (v: string) => `enc:${v}` }))

interface Notif { id: string; clinicId: string; status: string; acknowledgedAt: string | null }

const store = vi.hoisted(() => ({
  notifs: new Map<string, { id: string; clinicId: string; status: string; acknowledgedAt: string | null }>(),
  lastSeen: new Map<string, string>(),
  users: new Set<string>(),
}))

vi.mock('@docmee/db', () => ({
  createServiceDbClient: () => ({ end: async () => {} }),
  createClinicsRepository: () => ({}),
  createNotificationsRepository: () => ({
    listByClinic: async (clinicId: string, limit = 50) =>
      [...store.notifs.values()].filter((n) => n.clinicId === clinicId).slice(0, limit),
    acknowledge: async (id: string) => {
      const n = store.notifs.get(id)
      if (!n) return null
      n.status = 'acknowledged'
      n.acknowledgedAt = 'now'
      return n
    },
  }),
  createUsersRepository: () => ({
    touchLastSeen: async (id: string) => {
      if (!store.users.has(id)) return false
      store.lastSeen.set(id, 'now')
      return true
    },
  }),
}))

import { buildApp } from '../app.js'

describe('notification + heartbeat routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test'
    app = await buildApp()
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(() => {
    store.notifs.clear()
    store.lastSeen.clear()
    store.users.clear()
  })

  const seed = (n: Notif) => store.notifs.set(n.id, n)

  it('GET /notifications without clinic_id → 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/notifications' })
    expect(res.statusCode).toBe(400)
  })

  it('GET /notifications?clinic_id=X → only that clinic, newest first', async () => {
    seed({ id: 'a', clinicId: 'c1', status: 'pending', acknowledgedAt: null })
    seed({ id: 'b', clinicId: 'c2', status: 'pending', acknowledgedAt: null })
    const res = await app.inject({ method: 'GET', url: '/notifications?clinic_id=c1' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.notifications).toHaveLength(1)
    expect(body.notifications[0].id).toBe('a')
  })

  it('POST /notifications/:id/acknowledge → marks acknowledged', async () => {
    seed({ id: 'a', clinicId: 'c1', status: 'pending', acknowledgedAt: null })
    const res = await app.inject({ method: 'POST', url: '/notifications/a/acknowledge' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).notification.status).toBe('acknowledged')
    expect(store.notifs.get('a')!.status).toBe('acknowledged')
  })

  it('POST /notifications/:id/acknowledge for unknown id → 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/notifications/missing/acknowledge' })
    expect(res.statusCode).toBe(404)
  })

  it('POST /user/heartbeat updates last_seen', async () => {
    store.users.add('u1')
    const res = await app.inject({ method: 'POST', url: '/user/heartbeat', payload: { clinicUserId: 'u1' } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
    expect(store.lastSeen.get('u1')).toBe('now')
  })

  it('POST /user/heartbeat without clinicUserId → 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/user/heartbeat', payload: {} })
    expect(res.statusCode).toBe(400)
  })

  it('POST /user/heartbeat for unknown user → 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/user/heartbeat', payload: { clinicUserId: 'ghost' } })
    expect(res.statusCode).toBe(404)
  })
})
