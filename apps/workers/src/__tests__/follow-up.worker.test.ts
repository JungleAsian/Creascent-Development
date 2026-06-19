import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  sendWhatsAppText: vi.fn(),
  followUpAdd: vi.fn(),
  findClinic: vi.fn(),
  findPatient: vi.fn(),
  listContacts: vi.fn(),
  listByClinic: vi.fn(),
  findAppointment: vi.fn(),
  createIfAbsent: vi.fn(),
  markSent: vi.fn(),
  existsRecentByConversation: vi.fn(),
  findLastInboundAt: vi.fn(),
  findApprovedByCategory: vi.fn(),
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
  createAppointmentsRepository: () => ({ findById: h.findAppointment }),
  createFollowUpsRepository: () => ({
    createIfAbsent: h.createIfAbsent,
    markSent: h.markSent,
    existsRecentByConversation: h.existsRecentByConversation,
  }),
  createMessagesRepository: () => ({ findLastInboundAt: h.findLastInboundAt }),
  createMessageTemplatesRepository: () => ({ findApprovedByCategory: h.findApprovedByCategory }),
}))

import { processFollowUpJob, scheduleFollowUp, FOLLOW_UP_TYPES } from '../follow-up.worker.js'

const CLINIC = '11111111-1111-1111-1111-111111111111'
const PATIENT = '22222222-2222-2222-2222-222222222222'
const APPT = '33333333-3333-3333-3333-333333333333'
const CONVO = '44444444-4444-4444-4444-444444444444'

const makeJob = (data: unknown) => ({ data }) as never

const base = { clinicId: CLINIC, patientId: PATIENT, type: FOLLOW_UP_TYPES.CONFIRMATION, appointmentId: APPT }

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
  h.findAppointment.mockResolvedValue({ id: APPT, status: 'confirmed', startTime: '2026-07-01T14:30:00.000Z' })
  h.createIfAbsent.mockResolvedValue({ id: 'fu-1' })
  h.existsRecentByConversation.mockResolvedValue(false)
  // Within the 24h customer-care window by default (a recent inbound message).
  h.findLastInboundAt.mockResolvedValue(new Date().toISOString())
  h.findApprovedByCategory.mockResolvedValue(null)
})

describe('processFollowUpJob', () => {
  it('sends a free-text confirmation inside the 24h window', async () => {
    await processFollowUpJob(makeJob(base))
    expect(h.sendWhatsAppText).toHaveBeenCalledTimes(1)
    const [phoneId, , to, text] = h.sendWhatsAppText.mock.calls[0]
    expect(phoneId).toBe('PHONE_ID')
    expect(to).toBe('50299998889')
    expect(text).toContain('cita') // Spanish default copy
    expect(h.createIfAbsent).toHaveBeenCalledTimes(1)
    expect(h.markSent).toHaveBeenCalledWith(CLINIC, 'fu-1')
  })

  it('uses the English copy when the patient language is en', async () => {
    h.findPatient.mockResolvedValue({ id: PATIENT, metadata: { language: 'en' } })
    await processFollowUpJob(makeJob({ ...base, type: FOLLOW_UP_TYPES.REVIEW_REQUEST, appointmentId: APPT }))
    const [, , , text] = h.sendWhatsAppText.mock.calls[0]
    expect(text).toContain('feedback')
  })

  it('NEVER messages an opted-out patient', async () => {
    h.findPatient.mockResolvedValue({ id: PATIENT, metadata: { optedOut: true } })
    await processFollowUpJob(makeJob(base))
    expect(h.sendWhatsAppText).not.toHaveBeenCalled()
  })

  it('skips a follow-up for a cancelled appointment', async () => {
    h.findAppointment.mockResolvedValue({ id: APPT, status: 'cancelled', startTime: '2026-07-01T14:30:00.000Z' })
    await processFollowUpJob(makeJob(base))
    expect(h.sendWhatsAppText).not.toHaveBeenCalled()
    expect(h.createIfAbsent).not.toHaveBeenCalled()
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

  it('does not double-send when the follow-up was already recorded', async () => {
    h.createIfAbsent.mockResolvedValue(null) // (appointment, type) already claimed
    await processFollowUpJob(makeJob(base))
    expect(h.sendWhatsAppText).not.toHaveBeenCalled()
  })

  describe('24h customer-care window', () => {
    it('skips when outside the window and no approved template exists', async () => {
      h.findLastInboundAt.mockResolvedValue(null) // never wrote → outside window
      await processFollowUpJob(makeJob({ ...base, type: FOLLOW_UP_TYPES.POST_CONSULTATION }))
      expect(h.sendWhatsAppText).not.toHaveBeenCalled()
      expect(h.createIfAbsent).not.toHaveBeenCalled()
    })

    it('sends the approved template body when outside the window', async () => {
      h.findLastInboundAt.mockResolvedValue(null) // outside window
      h.findApprovedByCategory.mockResolvedValue({ id: 't1', body: 'APPROVED REMINDER BODY' })
      await processFollowUpJob(makeJob({ ...base, type: FOLLOW_UP_TYPES.REMINDER }))
      expect(h.findApprovedByCategory).toHaveBeenCalledWith(CLINIC, 'appointment_reminder')
      const [, , , text] = h.sendWhatsAppText.mock.calls[0]
      expect(text).toBe('APPROVED REMINDER BODY')
    })
  })

  describe('no_response', () => {
    const noResp = {
      clinicId: CLINIC,
      patientId: PATIENT,
      type: FOLLOW_UP_TYPES.NO_RESPONSE,
      conversationId: CONVO,
      silentSinceIso: '2026-06-19T10:00:00.000Z',
    }

    it('self-cancels when the patient replied after it was scheduled', async () => {
      h.findLastInboundAt.mockResolvedValue('2026-06-19T11:00:00.000Z') // replied later
      await processFollowUpJob(makeJob(noResp))
      expect(h.sendWhatsAppText).not.toHaveBeenCalled()
    })

    it('dedupes a second nudge for the same conversation', async () => {
      h.findLastInboundAt.mockResolvedValue('2026-06-19T09:00:00.000Z') // before silentSince → still silent
      h.existsRecentByConversation.mockResolvedValue(true)
      await processFollowUpJob(makeJob(noResp))
      expect(h.sendWhatsAppText).not.toHaveBeenCalled()
    })

    it('sends one nudge when still silent and not yet sent', async () => {
      // Inside the window (recent enough) but no reply after silentSince.
      h.findLastInboundAt.mockResolvedValue(new Date().toISOString())
      const recentSilent = { ...noResp, silentSinceIso: new Date(Date.now() + 1000).toISOString() }
      await processFollowUpJob(makeJob(recentSilent))
      expect(h.sendWhatsAppText).toHaveBeenCalledTimes(1)
      const [, , , text] = h.sendWhatsAppText.mock.calls[0]
      expect(text).toContain('pendientes')
    })
  })

  it('scheduleFollowUp enqueues a delayed job', async () => {
    await scheduleFollowUp(base, 24 * 60 * 60 * 1000)
    expect(h.followUpAdd).toHaveBeenCalledWith('follow-up', base, { delay: 86_400_000 })
  })
})
