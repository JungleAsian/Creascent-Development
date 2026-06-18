import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  sendWhatsAppText: vi.fn(),
  followUpAdd: vi.fn(),
  findClinic: vi.fn(),
  findPatient: vi.fn(),
  listContacts: vi.fn(),
  listByClinic: vi.fn(),
  end: vi.fn(),
}))

vi.mock('@docmee/channels', () => ({ sendWhatsAppText: h.sendWhatsAppText }))

vi.mock('@docmee/queue', () => ({
  followUpQueue: { add: h.followUpAdd },
}))

vi.mock('@docmee/db', () => ({
  createServiceDbClient: () => ({ end: h.end }),
  createClinicsRepository: () => ({ findById: h.findClinic }),
  createPatientsRepository: () => ({ findById: h.findPatient, listContacts: h.listContacts }),
  createChannelAccountsRepository: () => ({ listByClinic: h.listByClinic }),
}))

import { processFollowUpJob, scheduleFollowUp, FOLLOW_UP_TYPES } from '../follow-up.worker.js'

const CLINIC = '11111111-1111-1111-1111-111111111111'
const PATIENT = '22222222-2222-2222-2222-222222222222'

const makeJob = (data: unknown) => ({ data }) as never

const base = { clinicId: CLINIC, patientId: PATIENT, type: FOLLOW_UP_TYPES.POST_APPOINTMENT }

beforeEach(() => {
  vi.clearAllMocks()
  h.findClinic.mockResolvedValue({ id: CLINIC, name: 'Clinic', timezone: 'UTC' })
  h.findPatient.mockResolvedValue({ id: PATIENT, metadata: {} })
  h.listContacts.mockResolvedValue([
    { channel: 'whatsapp', contactHandle: '50299998889', isPrimary: true },
  ])
  h.listByClinic.mockResolvedValue([
    { channel: 'whatsapp', status: 'active', accountId: 'PHONE_ID', accessTokenEnc: 'token' },
  ])
})

describe('processFollowUpJob', () => {
  it('sends a WhatsApp follow-up to a consenting patient', async () => {
    await processFollowUpJob(makeJob(base))
    expect(h.sendWhatsAppText).toHaveBeenCalledTimes(1)
    const [phoneId, , to, text] = h.sendWhatsAppText.mock.calls[0]
    expect(phoneId).toBe('PHONE_ID')
    expect(to).toBe('50299998889')
    expect(text).toContain('cita') // Spanish default copy
  })

  it('uses the English copy when the patient language is en', async () => {
    h.findPatient.mockResolvedValue({ id: PATIENT, metadata: { language: 'en' } })
    await processFollowUpJob(makeJob({ ...base, type: FOLLOW_UP_TYPES.REVIEW_REQUEST }))
    const [, , , text] = h.sendWhatsAppText.mock.calls[0]
    expect(text).toContain('feedback')
  })

  it('NEVER messages an opted-out patient', async () => {
    h.findPatient.mockResolvedValue({ id: PATIENT, metadata: { optedOut: true } })
    await processFollowUpJob(makeJob(base))
    expect(h.sendWhatsAppText).not.toHaveBeenCalled()
  })

  it('stays silent when the patient has no WhatsApp contact', async () => {
    h.listContacts.mockResolvedValue([])
    await processFollowUpJob(makeJob(base))
    expect(h.sendWhatsAppText).not.toHaveBeenCalled()
  })

  it('drops the job for an unknown clinic', async () => {
    h.findClinic.mockResolvedValue(null)
    await processFollowUpJob(makeJob(base))
    expect(h.sendWhatsAppText).not.toHaveBeenCalled()
    expect(h.end).toHaveBeenCalled() // db connection always closed
  })

  it('scheduleFollowUp enqueues a delayed job', async () => {
    await scheduleFollowUp(base, 24 * 60 * 60 * 1000)
    expect(h.followUpAdd).toHaveBeenCalledWith('follow-up', base, { delay: 86_400_000 })
  })
})
