import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  transcriptionAdd: vi.fn(),
  agentAdd: vi.fn(),
  notificationAdd: vi.fn(),
  findByAccount: vi.fn(),
  findByContact: vi.fn(),
  createPatient: vi.fn(),
  addContact: vi.fn(),
  updatePatient: vi.fn(),
  end: vi.fn(),
}))

vi.mock('@docmee/queue', () => ({
  transcriptionQueue: { add: h.transcriptionAdd },
  agentQueue: { add: h.agentAdd },
  notificationQueue: { add: h.notificationAdd },
}))

vi.mock('@docmee/db', () => ({
  createServiceDbClient: () => ({ end: h.end }),
  createChannelAccountsRepository: () => ({ findByAccount: h.findByAccount }),
  createPatientsRepository: () => ({
    findByContact: h.findByContact,
    create: h.createPatient,
    addContact: h.addContact,
    update: h.updatePatient,
  }),
}))

import { processConversationJob } from '../conversation-processor.worker.js'

const CLINIC = '11111111-1111-1111-1111-111111111111'
const PATIENT = '22222222-2222-2222-2222-222222222222'

const makeJob = (data: unknown) => ({ data }) as never

const base = {
  phoneNumberId: 'PHONE_ID',
  patientWaId: '5215555555555',
  patientName: 'Ana',
  waMessageId: 'wamid.ABC',
  timestamp: 1700000000000,
}

const activeAccount = { clinicId: CLINIC, accessTokenEnc: 'token', settings: {} }

beforeEach(() => {
  vi.clearAllMocks()
  h.findByAccount.mockResolvedValue(activeAccount)
  h.findByContact.mockResolvedValue({ id: PATIENT, status: 'returning' })
  h.createPatient.mockResolvedValue({ id: PATIENT, status: 'new' })
})

describe('processConversationJob', () => {
  it('audio message → transcription queue', async () => {
    await processConversationJob(makeJob({ ...base, messageType: 'audio', mediaId: 'media1', mimeType: 'audio/ogg' }))
    expect(h.transcriptionAdd).toHaveBeenCalledTimes(1)
    expect(h.agentAdd).not.toHaveBeenCalled()
    const [, job] = h.transcriptionAdd.mock.calls[0]
    expect(job.clinicId).toBe(CLINIC)
    expect(job.waAccessToken).toBe('token')
  })

  it('text message → agent queue with resolved clinic', async () => {
    await processConversationJob(makeJob({ ...base, messageType: 'text', content: 'hola' }))
    expect(h.agentAdd).toHaveBeenCalledTimes(1)
    expect(h.transcriptionAdd).not.toHaveBeenCalled()
    const [, job] = h.agentAdd.mock.calls[0]
    expect(job.clinicId).toBe(CLINIC)
    expect(job.message).toBe('hola')
    expect(job.isNewPatient).toBe(false)
  })

  it('unknown phone_number_id → drops the message, no routing', async () => {
    h.findByAccount.mockResolvedValue(null)
    await processConversationJob(makeJob({ ...base, messageType: 'text', content: 'hola' }))
    expect(h.agentAdd).not.toHaveBeenCalled()
    expect(h.transcriptionAdd).not.toHaveBeenCalled()
    expect(h.end).toHaveBeenCalled()
  })

  it('new patient → creates patient + contact and flags isNewPatient', async () => {
    h.findByContact.mockResolvedValue(null)
    await processConversationJob(makeJob({ ...base, messageType: 'text', content: 'hola' }))
    expect(h.createPatient).toHaveBeenCalledTimes(1)
    expect(h.addContact).toHaveBeenCalledTimes(1)
    const [, job] = h.agentAdd.mock.calls[0]
    expect(job.isNewPatient).toBe(true)
    expect(job.patientId).toBe(PATIENT)
  })

  it('expiring Meta token → enqueues a notification', async () => {
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    h.findByAccount.mockResolvedValue({ ...activeAccount, settings: { tokenExpiresAt: soon } })
    await processConversationJob(makeJob({ ...base, messageType: 'text', content: 'hola' }))
    expect(h.notificationAdd).toHaveBeenCalledTimes(1)
    const [, job] = h.notificationAdd.mock.calls[0]
    expect(job.type).toBe('META_TOKEN_EXPIRING')
  })

  it('invalid payload → throws ZodError', async () => {
    await expect(processConversationJob(makeJob({ foo: 'bar' }))).rejects.toThrow()
  })
})
