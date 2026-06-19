import { describe, it, expect, vi, beforeEach } from 'vitest'

// Bot Interruption Rule (Rev1 #6) + explicit human-request handoff (#5).
// We keep the REAL handoff predicates (isBotPaused/detectHumanRequest/...) and
// the real intent router, and stub only the LLM + clinic bot so we can assert the
// worker's routing decisions without a live model or database.

const h = vi.hoisted(() => ({
  runClinicBot: vi.fn(),
  classifyIntent: vi.fn(),
  sendWhatsAppText: vi.fn(),
  schedulingAdd: vi.fn(),
  notificationAdd: vi.fn(),
  findClinic: vi.fn(),
  listAccounts: vi.fn(),
  findPatient: vi.fn(),
  listEmbeddedChunks: vi.fn(),
  listEnabledFlows: vi.fn(),
  findConversation: vi.fn(),
  updateConversation: vi.fn(),
  createTag: vi.fn(),
  addTag: vi.fn(),
  end: vi.fn(),
}))

vi.mock('@docmee/llm', () => ({
  classifyIntent: h.classifyIntent,
  claudeComplete: vi.fn(),
  embedText: vi.fn(),
}))

vi.mock('@docmee/agents', async () => {
  const actual = await vi.importActual<typeof import('@docmee/agents')>('@docmee/agents')
  return {
    ...actual,
    runClinicBot: h.runClinicBot,
    searchKb: vi.fn().mockResolvedValue([]),
    isInsideBusinessHours: vi.fn().mockReturnValue(true),
    matchCustomFlow: vi.fn().mockReturnValue(null),
  }
})

vi.mock('@docmee/channels', () => ({
  sendWhatsAppText: h.sendWhatsAppText,
  sendMessengerText: vi.fn(),
  sendInstagramText: vi.fn(),
}))

vi.mock('@docmee/queue', () => ({
  schedulingQueue: { add: h.schedulingAdd },
  notificationQueue: { add: h.notificationAdd },
}))

vi.mock('@docmee/db', () => ({
  createServiceDbClient: () => ({ end: h.end }),
  createClinicsRepository: () => ({ findById: h.findClinic }),
  createChannelAccountsRepository: () => ({ listByClinic: h.listAccounts }),
  createPatientsRepository: () => ({ findById: h.findPatient }),
  createKnowledgeRepository: () => ({ listEmbeddedChunks: h.listEmbeddedChunks }),
  createErrorReviewsRepository: () => ({ create: vi.fn() }),
  createConversationsRepository: () => ({
    findById: h.findConversation,
    update: h.updateConversation,
    createTag: h.createTag,
    addTag: h.addTag,
  }),
  createCustomFlowsRepository: () => ({ listEnabled: h.listEnabledFlows }),
}))

import { processAgentJob } from '../agent-processor.worker.js'

const CLINIC = '11111111-1111-1111-1111-111111111111'
const CONVO = '33333333-3333-3333-3333-333333333333'

const makeJob = (data: unknown) => ({ data }) as never

const baseJob = {
  clinicId: CLINIC,
  channel: 'whatsapp' as const,
  patientWaId: '5215555555555',
  message: 'Hola, ¿cuáles son sus horarios?',
  waMessageId: 'wamid.ABC',
  conversationId: CONVO,
}

beforeEach(() => {
  vi.clearAllMocks()
  h.findClinic.mockResolvedValue({ id: CLINIC, name: 'Clinica', settings: {}, timezone: 'America/Mexico_City' })
  h.listAccounts.mockResolvedValue([
    { channel: 'whatsapp', status: 'active', accountId: 'PHONE', accessTokenEnc: 'tok' },
  ])
  h.findPatient.mockResolvedValue(null)
  h.listEmbeddedChunks.mockResolvedValue([])
  h.listEnabledFlows.mockResolvedValue([])
  h.classifyIntent.mockResolvedValue('general_question')
  h.createTag.mockResolvedValue({ id: 'tag1' })
})

describe('processAgentJob — bot interruption rule', () => {
  it('stays silent when a human owns the conversation (status handoff)', async () => {
    h.findConversation.mockResolvedValue({ id: CONVO, status: 'handoff', metadata: {} })
    await processAgentJob(makeJob(baseJob))
    expect(h.runClinicBot).not.toHaveBeenCalled()
    expect(h.sendWhatsAppText).not.toHaveBeenCalled()
    expect(h.classifyIntent).not.toHaveBeenCalled()
  })

  it('stays silent for an assigned conversation', async () => {
    h.findConversation.mockResolvedValue({ id: CONVO, status: 'assigned', metadata: {} })
    await processAgentJob(makeJob(baseJob))
    expect(h.runClinicBot).not.toHaveBeenCalled()
    expect(h.sendWhatsAppText).not.toHaveBeenCalled()
  })

  it('runs the bot when the conversation is open', async () => {
    h.findConversation.mockResolvedValue({ id: CONVO, status: 'open', metadata: {} })
    await processAgentJob(makeJob(baseJob))
    expect(h.runClinicBot).toHaveBeenCalledTimes(1)
  })
})

describe('processAgentJob — explicit human request (#5)', () => {
  it('acks the patient, pauses the bot, and alerts a human', async () => {
    h.findConversation.mockResolvedValue({ id: CONVO, status: 'open', metadata: {} })
    await processAgentJob(makeJob({ ...baseJob, message: 'Quiero hablar con una persona' }))

    // Patient gets the handoff ack; the LLM/bot is never invoked.
    expect(h.sendWhatsAppText).toHaveBeenCalledTimes(1)
    expect(h.runClinicBot).not.toHaveBeenCalled()
    expect(h.classifyIntent).not.toHaveBeenCalled()

    // Conversation flipped to handoff with the pause metadata.
    expect(h.updateConversation).toHaveBeenCalledWith(
      CLINIC,
      CONVO,
      expect.objectContaining({ status: 'handoff' }),
    )
    const [, , update] = h.updateConversation.mock.calls[0]
    expect(update.metadata.handoffReason).toBe('patient_request')
    expect(typeof update.metadata.botPausedAt).toBe('string')

    // And a human handoff notification is queued.
    expect(h.notificationAdd).toHaveBeenCalledWith(
      'notify',
      expect.objectContaining({ reason: 'human_handoff', conversationId: CONVO }),
    )
  })
})
