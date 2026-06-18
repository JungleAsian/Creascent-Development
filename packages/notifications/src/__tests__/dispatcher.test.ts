import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { dispatchNotification, type NotificationStore } from '../dispatcher.js'
import type { SendEmailParams } from '../channels/email.channel.js'
import { buildNotificationEmail } from '../templates.js'
import { NOTIFICATION_TYPES } from '../notification-types.js'

function makeStore() {
  const created: Array<Record<string, unknown>> = []
  const statuses: Array<{ id: string; status: string; error?: string | null }> = []
  const store: NotificationStore = {
    create: vi.fn(async (input) => {
      created.push(input)
      return { id: `n${created.length}` }
    }),
    updateStatus: vi.fn(async (id, status, error) => {
      statuses.push({ id, status, error })
    }),
  }
  return { store, created, statuses }
}

describe('dispatchNotification', () => {
  beforeEach(() => {
    process.env['LLM_STUB'] = 'true'
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('LLM_STUB=true → real sendEmail is skipped but the DB entry is still created', async () => {
    const { store, created, statuses } = makeStore()
    // No injected sendEmail → uses the real resend-backed one, which short-circuits on LLM_STUB.
    await dispatchNotification(
      { clinicId: 'c1', type: NOTIFICATION_TYPES.NEW_PATIENT, recipientEmail: 'a@b.com' },
      { store },
    )
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ clinicId: 'c1', recipient: 'a@b.com', status: 'pending' })
    // Delivery still "succeeds" (skipped, no throw) → status flips to sent.
    expect(statuses).toEqual([{ id: 'n1', status: 'sent', error: undefined }])
  })

  it('emergency type → priority p1 is persisted', async () => {
    const { store, created } = makeStore()
    await dispatchNotification(
      { clinicId: 'c1', type: NOTIFICATION_TYPES.EMERGENCY, recipientEmail: 'a@b.com' },
      { store },
    )
    expect(created[0]).toMatchObject({ alertType: 'emergency', priority: 'p1' })
  })

  it('sends the templated email through the injected sender', async () => {
    const { store } = makeStore()
    const sent: SendEmailParams[] = []
    const sendEmail = vi.fn(async (params: SendEmailParams) => {
      sent.push(params)
    })
    await dispatchNotification(
      { clinicId: 'c1', type: NOTIFICATION_TYPES.BOOKING_CONFIRMED, recipientEmail: 'a@b.com' },
      { store, sendEmail },
    )
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sent[0]!.to).toBe('a@b.com')
    expect(sent[0]!.subject).toContain('Appointment confirmed')
  })

  it('delivery failure → status failed, but never throws', async () => {
    const { store, statuses } = makeStore()
    const sendEmail = vi.fn(async () => {
      throw new Error('resend down')
    })
    await expect(
      dispatchNotification(
        { clinicId: 'c1', type: NOTIFICATION_TYPES.EMERGENCY, recipientEmail: 'a@b.com' },
        { store, sendEmail },
      ),
    ).resolves.toBeUndefined()
    expect(statuses).toEqual([{ id: 'n1', status: 'failed', error: 'resend down' }])
  })

  it('every notification type has a defined, non-empty template', () => {
    for (const type of Object.values(NOTIFICATION_TYPES)) {
      const email = buildNotificationEmail(type, { sample: 1 })
      expect(email).toBeDefined()
      expect(email.subject.length).toBeGreaterThan(0)
      expect(email.html.length).toBeGreaterThan(0)
    }
  })
})
