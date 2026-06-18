import { NOTIFICATION_PRIORITY, type NotificationType, type NotificationPriority } from './notification-types.js'
import { buildNotificationEmail } from './templates.js'
import { sendEmail as defaultSendEmail, type SendEmailFn } from './channels/email.channel.js'

export interface DispatchNotificationParams {
  clinicId: string
  conversationId?: string | null
  type: NotificationType
  data?: Record<string, unknown>
  recipientEmail: string
}

/** Persistence the dispatcher needs — supplied by the worker (backed by @docmee/db). */
export interface NotificationStore {
  create(input: {
    clinicId: string
    conversationId?: string | null
    alertType: NotificationType
    priority: NotificationPriority
    recipient: string
    subject: string
    content: string
    status: 'pending'
  }): Promise<{ id: string }>
  updateStatus(id: string, status: 'sent' | 'failed', error?: string | null): Promise<void>
}

export interface DispatchNotificationDeps {
  store: NotificationStore
  /** Defaults to the resend-backed sendEmail; overridable for tests. */
  sendEmail?: SendEmailFn
}

/**
 * Persist a notification and deliver it by email. P1/P2/standard all send
 * immediately for the MVP (a background priority queue is a Phase-2 concern).
 * Delivery failures are recorded (status='failed') but never thrown — a failed
 * alert email must not crash the worker processing the job.
 */
export async function dispatchNotification(
  params: DispatchNotificationParams,
  deps: DispatchNotificationDeps,
): Promise<void> {
  const send = deps.sendEmail ?? defaultSendEmail
  const priority = NOTIFICATION_PRIORITY[params.type]
  const { subject, html } = buildNotificationEmail(params.type, params.data ?? {})

  const saved = await deps.store.create({
    clinicId: params.clinicId,
    conversationId: params.conversationId ?? null,
    alertType: params.type,
    priority,
    recipient: params.recipientEmail,
    subject,
    content: html,
    status: 'pending',
  })

  try {
    await send({ to: params.recipientEmail, subject, html })
    await deps.store.updateStatus(saved.id, 'sent')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await deps.store.updateStatus(saved.id, 'failed', message)
  }
}
