import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// buildApp wires every route; stub the workspace deps so no real Redis/DB/Google loads.
vi.mock('@docmee/queue', () => ({
  whatsappInboundQueue: { add: vi.fn() },
  kbEmbedQueue: { add: vi.fn() },
}))
vi.mock('@docmee/agents', () => ({ getOAuth2Client: () => ({}) }))
// Req 3 media proxy: stub the Graph media fetch so no real network call runs.
const { fetchMedia } = vi.hoisted(() => ({
  fetchMedia: vi.fn(async () => ({
    buffer: new TextEncoder().encode('JPEGBYTES').buffer,
    mimeType: 'image/jpeg',
  })),
}))
vi.mock('../lib/whatsapp-media.js', () => ({ fetchWhatsAppMedia: fetchMedia }))
// Req 3/33/34 outbound send: stub the inlined channel senders so no real Meta
// call runs. Each returns the provider message id the route persists.
const { sendWa, sendMsgr, sendIg } = vi.hoisted(() => ({
  sendWa: vi.fn(async () => 'wamid.OUT1' as string | null),
  sendMsgr: vi.fn(async () => 'mid.OUT1' as string | null),
  sendIg: vi.fn(async () => 'mid.IG1' as string | null),
}))
vi.mock('../lib/channel-send.js', () => ({
  sendWhatsAppText: sendWa,
  sendMessengerText: sendMsgr,
  sendInstagramText: sendIg,
}))
// Mutable clinic config so a test can flip a channel's connected state.
const clinicCfg = vi.hoisted(() => ({
  messengerEnabled: true,
  messengerPageAccessTokenEncrypted: 'mtok' as string | null,
  instagramEnabled: true,
  instagramPageAccessTokenEncrypted: 'itok' as string | null,
}))
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
    // Dedicated open conversations for the outbound manual-reply send tests
    // (Req 3/33/34) — separate from open-1 so the assign tests can't mutate them.
    [
      'wa-send',
      {
        id: 'wa-send',
        clinicId: 'c-1',
        channel: 'whatsapp',
        channelContactHandle: '+50277778888',
        status: 'open',
        assignedTo: null,
        metadata: {},
      },
    ],
    [
      'wa-fail',
      {
        id: 'wa-fail',
        clinicId: 'c-1',
        channel: 'whatsapp',
        channelContactHandle: '+50299990000',
        status: 'open',
        assignedTo: null,
        metadata: {},
      },
    ],
    [
      'msgr-send',
      {
        id: 'msgr-send',
        clinicId: 'c-1',
        channel: 'messenger',
        channelContactHandle: 'PSID-123',
        status: 'open',
        assignedTo: null,
        metadata: {},
      },
    ],
  ]),
  created: [] as Record<string, unknown>[],
  // Outbound messages persisted by POST /:id/messages (Req 3).
  sent: [] as Record<string, unknown>[],
  flagged: [] as Record<string, unknown>[],
  // Conversation messages (Req 3 media proxy). An image with a media id on open-1,
  // an image with no media id, and a text message — to exercise the proxy guards.
  messages: new Map<string, Record<string, unknown>>([
    ['msg-img', { id: 'msg-img', conversationId: 'open-1', clinicId: 'c-1', contentType: 'image', metadata: { mediaId: 'media-1' } }],
    ['msg-nomedia', { id: 'msg-nomedia', conversationId: 'open-1', clinicId: 'c-1', contentType: 'image', metadata: {} }],
    ['msg-text', { id: 'msg-text', conversationId: 'open-1', clinicId: 'c-1', contentType: 'text', metadata: {} }],
  ]),
  // Internal notes (Req 13). 'note-1' is authored by u-1; edit/delete is author-only.
  notes: new Map<string, Record<string, unknown>>([
    [
      'note-1',
      {
        id: 'note-1',
        conversationId: 'open-1',
        clinicId: 'c-1',
        authorId: 'u-1',
        content: 'Patient prefers mornings',
        createdAt: '2026-06-19T10:00:00.000Z',
        updatedAt: '2026-06-19T10:00:00.000Z',
      },
    ],
  ]),
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
    listNotes: async (clinicId: string, conversationId: string) =>
      [...store.notes.values()].filter((n) => n.clinicId === clinicId && n.conversationId === conversationId),
    addNote: async (data: Record<string, unknown>) => {
      const row = {
        ...data,
        id: `note-${store.notes.size + 1}`,
        createdAt: '2026-06-19T11:00:00.000Z',
        updatedAt: '2026-06-19T11:00:00.000Z',
      }
      store.notes.set(row.id as string, row)
      return row
    },
    findNoteById: async (clinicId: string, noteId: string) => {
      const n = store.notes.get(noteId)
      return n && n.clinicId === clinicId ? n : null
    },
    updateNote: async (clinicId: string, noteId: string, content: string) => {
      const n = store.notes.get(noteId)
      if (!n || n.clinicId !== clinicId) return null
      const updated = { ...n, content, updatedAt: '2026-06-19T12:00:00.000Z' }
      store.notes.set(noteId, updated)
      return updated
    },
    deleteNote: async (_clinicId: string, noteId: string) => {
      store.notes.delete(noteId)
    },
  }),
  createMessagesRepository: () => ({
    findById: async (clinicId: string, id: string) => {
      const m = store.messages.get(id)
      return m && m.clinicId === clinicId ? m : null
    },
    create: async (data: Record<string, unknown>) => {
      const row = { ...data, id: `sent-${store.sent.length + 1}`, createdAt: '2026-06-19T13:00:00.000Z' }
      store.sent.push(row)
      return row
    },
  }),
  createChannelAccountsRepository: () => ({
    listByClinic: async (clinicId: string) =>
      clinicId === 'c-1'
        ? [{ channel: 'whatsapp', status: 'active', accountId: 'PHONE', accessTokenEnc: 'tok' }]
        : [],
  }),
  createClinicsRepository: () => ({
    findById: async (id: string) => (id === 'c-1' ? { id: 'c-1', ...clinicCfg } : null),
  }),
  createPatientsRepository: () => ({}),
  createKnowledgeRepository: () => ({}),
  createNotificationsRepository: () => ({}),
  createUsersRepository: () => ({}),
  createErrorReviewsRepository: () => ({
    create: async (data: Record<string, unknown>) => {
      const row = { ...data, id: `err-${store.flagged.length + 1}`, status: 'open' }
      store.flagged.push(row)
      return row
    },
  }),
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

  it('GET /conversations?assigned_to=unassigned returns only unassigned conversations', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/conversations?assigned_to=unassigned',
      headers: auth,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const ids = body.conversations.map((c: { id: string }) => c.id)
    // old-1/open-1 (and the unassigned send fixtures) have assignedTo null;
    // mine-1/theirs-1 are assigned and must be excluded.
    expect(ids).toEqual(expect.arrayContaining(['old-1', 'open-1']))
    expect(ids).not.toContain('mine-1')
    expect(ids).not.toContain('theirs-1')
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

  // ── Internal notes: author-only edit/delete (Rev1 #13) ──
  it('POST /conversations/:id/notes creates a note authored by the caller', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/open-1/notes',
      headers: authHeader('secretary', 'sec-1'),
      payload: { content: 'Call back tomorrow' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.note.authorId).toBe('sec-1')
    expect(body.note.content).toBe('Call back tomorrow')
  })

  it('PATCH /conversations/:id/notes/:noteId by the author → 200 and updates content', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/conversations/open-1/notes/note-1',
      headers: authHeader('clinic_admin', 'u-1'),
      payload: { content: 'Patient prefers afternoons' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.note.content).toBe('Patient prefers afternoons')
    expect(body.note.updatedAt).not.toBe(body.note.createdAt)
  })

  it('PATCH a note authored by someone else → 403 (author-only)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/conversations/open-1/notes/note-1',
      headers: authHeader('doctor', 'someone-else'),
      payload: { content: 'I should not be able to edit this' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('PATCH a non-existent note → 404', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/conversations/open-1/notes/does-not-exist',
      headers: authHeader('clinic_admin', 'u-1'),
      payload: { content: 'x' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('DELETE a note authored by someone else → 403, then the author → 200', async () => {
    const forbidden = await app.inject({
      method: 'DELETE',
      url: '/conversations/open-1/notes/note-1',
      headers: authHeader('secretary', 'not-the-author'),
    })
    expect(forbidden.statusCode).toBe(403)
    expect(store.notes.has('note-1')).toBe(true)

    const ok = await app.inject({
      method: 'DELETE',
      url: '/conversations/open-1/notes/note-1',
      headers: authHeader('clinic_admin', 'u-1'),
    })
    expect(ok.statusCode).toBe(200)
    expect(JSON.parse(ok.body).deleted).toBe(true)
    expect(store.notes.has('note-1')).toBe(false)
  })

  it('PATCH /conversations/:id/notes/:noteId without auth → 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/conversations/open-1/notes/note-1',
      payload: { content: 'x' },
    })
    expect(res.statusCode).toBe(401)
  })

  // ── Flag a bad bot response → Error Review (Req 29) ──
  it('POST /conversations/:id/flag-response records a bad_response error review', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/open-1/flag-response',
      headers: authHeader('secretary', 'sec-9'),
      payload: { messageId: 'm-1', content: 'Tómese 2 ibuprofenos', note: 'gave dosage advice' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.error.errorType).toBe('bad_response')
    expect(body.error.errorMessage).toBe('Tómese 2 ibuprofenos')
    expect(body.error.context).toMatchObject({
      conversationId: 'open-1',
      messageId: 'm-1',
      flaggedBy: 'sec-9',
    })
  })

  it('POST /conversations/:id/flag-response for an unknown conversation → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/nope/flag-response',
      headers: authHeader('secretary', 'sec-9'),
      payload: { content: 'x' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('POST /conversations/:id/flag-response without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/open-1/flag-response',
      payload: { content: 'x' },
    })
    expect(res.statusCode).toBe(401)
  })

  // ── Inbound media proxy (Req 3) ──
  it('GET /conversations/:id/messages/:messageId/media streams an image with the right mime type', async () => {
    fetchMedia.mockClear()
    const res = await app.inject({
      method: 'GET',
      url: '/conversations/open-1/messages/msg-img/media',
      headers: auth,
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.body).toBe('JPEGBYTES')
    // The Graph fetch is called with the stored media id and the clinic's WhatsApp token.
    expect(fetchMedia).toHaveBeenCalledWith('media-1', 'tok')
  })

  it('GET media without auth → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/conversations/open-1/messages/msg-img/media',
    })
    expect(res.statusCode).toBe(401)
  })

  it('GET media for a non-image message → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/conversations/open-1/messages/msg-text/media',
      headers: auth,
    })
    expect(res.statusCode).toBe(404)
  })

  it('GET media for an image with no stored media id → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/conversations/open-1/messages/msg-nomedia/media',
      headers: auth,
    })
    expect(res.statusCode).toBe(404)
  })

  it('GET media for an unknown message → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/conversations/open-1/messages/ghost/media',
      headers: auth,
    })
    expect(res.statusCode).toBe(404)
  })

  // ── Outbound manual reply DELIVERY (Req 3/33/34) ──
  // A secretary's reply must actually reach the patient over the conversation's
  // channel, persist the provider message id, and pause the bot.
  it('POST /conversations/:id/messages sends over WhatsApp, persists the wamid and pauses the bot', async () => {
    sendWa.mockClear()
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/wa-send/messages',
      headers: authHeader('secretary'),
      payload: { content: 'Hola, ¿en qué puedo ayudarte?' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    // The send went out over WhatsApp with the clinic's phone id + token and the
    // patient's handle; the returned wamid is persisted as channel_message_id.
    expect(sendWa).toHaveBeenCalledWith('PHONE', 'tok', '+50277778888', 'Hola, ¿en qué puedo ayudarte?')
    expect(body.message.channelMessageId).toBe('wamid.OUT1')
    expect(body.message.role).toBe('agent')
    // Bot Interruption Rule: an `open` conversation flips to `handoff`.
    expect(store.conversations.get('wa-send')!.status).toBe('handoff')
  })

  it('POST /conversations/:id/messages on a Messenger thread sends via the Messenger transport', async () => {
    sendMsgr.mockClear()
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/msgr-send/messages',
      headers: authHeader('secretary'),
      payload: { content: 'Hello there' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(sendMsgr).toHaveBeenCalledWith('mtok', 'PSID-123', 'Hello there')
    expect(body.message.channelMessageId).toBe('mid.OUT1')
  })

  it('POST /conversations/:id/messages logs meta_send_failure and returns 502 when the send throws', async () => {
    sendWa.mockRejectedValueOnce(new Error('Meta 401: token expired'))
    const before = store.flagged.length
    const sentBefore = store.sent.length
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/wa-fail/messages',
      headers: authHeader('secretary'),
      payload: { content: 'will not send' },
    })
    expect(res.statusCode).toBe(502)
    // A failed send is recorded for the Error Review area and nothing is persisted.
    expect(store.flagged.length).toBe(before + 1)
    expect(store.flagged.at(-1)!.errorType).toBe('meta_send_failure')
    expect(store.sent.length).toBe(sentBefore)
    // The bot is NOT paused on a failed send (the conversation stays `open`).
    expect(store.conversations.get('wa-fail')!.status).toBe('open')
  })

  it('POST /conversations/:id/messages → 502 when the channel is not connected', async () => {
    clinicCfg.messengerEnabled = false
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/conversations/msgr-send/messages',
        headers: authHeader('secretary'),
        payload: { content: 'no channel' },
      })
      expect(res.statusCode).toBe(502)
    } finally {
      clinicCfg.messengerEnabled = true
    }
  })

  it('POST /conversations/:id/messages for an unknown conversation → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/ghost/messages',
      headers: authHeader('secretary'),
      payload: { content: 'hi' },
    })
    expect(res.statusCode).toBe(404)
  })
})
