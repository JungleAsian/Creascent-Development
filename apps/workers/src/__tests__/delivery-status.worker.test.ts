import { describe, it, expect, vi, beforeEach } from 'vitest'

// WhatsApp delivery-status tracking (Req 3). The worker resolves the clinic from
// the phone_number_id, matches the wamid to a persisted outbound message and
// records the lifecycle event — logging an error review only on a failed delivery.

const h = vi.hoisted(() => ({
  findByAccount: vi.fn(),
  recordDeliveryStatus: vi.fn(),
  createError: vi.fn(),
  end: vi.fn(),
}))

vi.mock('@docmee/db', () => ({
  createServiceDbClient: () => ({ end: h.end }),
  createChannelAccountsRepository: () => ({ findByAccount: h.findByAccount }),
  createMessagesRepository: () => ({ recordDeliveryStatus: h.recordDeliveryStatus }),
  createErrorReviewsRepository: () => ({ create: h.createError }),
}))

import { processDeliveryStatusJob } from '../delivery-status.worker.js'

const CLINIC = '11111111-1111-1111-1111-111111111111'
const makeJob = (data: unknown) => ({ data }) as never

beforeEach(() => {
  vi.clearAllMocks()
  h.findByAccount.mockResolvedValue({ clinicId: CLINIC, accountId: 'PHONE_ID' })
  h.recordDeliveryStatus.mockResolvedValue(true)
  h.createError.mockResolvedValue({ id: 'e1' })
})

describe('processDeliveryStatusJob', () => {
  it('records a delivered receipt against the matched message and logs no error', async () => {
    await processDeliveryStatusJob(
      makeJob({ phoneNumberId: 'PHONE_ID', channelMessageId: 'wamid.OUT1', status: 'delivered' }),
    )

    expect(h.recordDeliveryStatus).toHaveBeenCalledWith(CLINIC, 'wamid.OUT1', 'delivered', null)
    expect(h.createError).not.toHaveBeenCalled()
    expect(h.end).toHaveBeenCalledTimes(1)
  })

  it('records a failed receipt and logs a whatsapp_delivery_failure error review', async () => {
    await processDeliveryStatusJob(
      makeJob({
        phoneNumberId: 'PHONE_ID',
        channelMessageId: 'wamid.OUT2',
        status: 'failed',
        recipientId: '5215555555555',
        errorTitle: 'Re-engagement message',
        errorCode: 131047,
      }),
    )

    expect(h.recordDeliveryStatus).toHaveBeenCalledWith(
      CLINIC,
      'wamid.OUT2',
      'failed',
      'Re-engagement message (131047)',
    )
    expect(h.createError).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: CLINIC, errorType: 'whatsapp_delivery_failure' }),
    )
  })

  it('drops the receipt when no WhatsApp account owns the phone number', async () => {
    h.findByAccount.mockResolvedValue(null)

    await processDeliveryStatusJob(
      makeJob({ phoneNumberId: 'UNKNOWN', channelMessageId: 'wamid.X', status: 'read' }),
    )

    expect(h.recordDeliveryStatus).not.toHaveBeenCalled()
    expect(h.createError).not.toHaveBeenCalled()
    expect(h.end).toHaveBeenCalledTimes(1)
  })

  it('does not log an error review when a failed receipt matches no stored message', async () => {
    h.recordDeliveryStatus.mockResolvedValue(false)

    await processDeliveryStatusJob(
      makeJob({ phoneNumberId: 'PHONE_ID', channelMessageId: 'wamid.GONE', status: 'failed' }),
    )

    expect(h.recordDeliveryStatus).toHaveBeenCalledTimes(1)
    expect(h.createError).not.toHaveBeenCalled()
  })
})
