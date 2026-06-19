import { NOTIFICATION_PRIORITY, type NotificationType, type NotificationPriority } from './notification-types.js'
import { buildNotificationEmail } from './templates.js'
import { routeNotification } from './routing.js'
import { sendEmail as defaultSendEmail, type SendEmailFn } from './channels/email.channel.js'

export interface DispatchNotificationParams {
  clinicId: string
  conversationId?: string | null
  type: NotificationType
  data?: Record<string, unknown>
  recipientEmail: string
  /**
   * Whether the alert recipient is currently online in the panel. Drives the
   * email-vs-panel routing (see ./routing.ts). Defaults to offline (email sent).
   */
  recipientOnline?: boolean
}

/** Persistence the dispatcher needs — supplied by the worker (backed by @docmee/db). */
export interface NotificationStore {
  create(input: {
    clinicId: string
    conversationId?: string | null
    alertType: NotificationType
    priority: NotificationPriority
    /** Delivery channel chosen by routing: 'email' or panel-only 'in_app'. */
    notificationType: 'email' | 'in_app'
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
 * Persist a notification and deliver it on its routed channel(s). The alert is
 * always recorded for the in-panel feed; an email is additionally sent when
 * routing says so (p1 always, p2/standard only when the recipient is offline —
 * see ./routing.ts). Panel-only alerts are marked 'sent' on creation (delivered
 * to the feed). Email failures are recorded (status='failed') but never thrown —
 * a failed alert email must not crash the worker processing the job.
 */
export async function dispatchNotification(
  params: DispatchNotificationParams,
  deps: DispatchNotificationDeps,
): Promise<void> {
  const send = deps.sendEmail ?? defaultSendEmail
  const priority = NOTIFICATION_PRIORITY[params.type]
  const route = routeNotification(priority, params.recipientOnline)
  const { subject, html } = buildNotificationEmail(params.type, params.data ?? {})

  const saved = await deps.store.create({
    clinicId: params.clinicId,
    conversationId: params.conversationId ?? null,
    alertType: params.type,
    priority,
    notificationType: route.channel,
    recipient: params.recipientEmail,
    subject,
    content: html,
    status: 'pending',
  })

  // Panel-only (online recipient, non-urgent): the feed entry IS the delivery.
  if (!route.email) {
    await deps.store.updateStatus(saved.id, 'sent')
    return
  }

  try {
    await send({ to: params.recipientEmail, subject, html })
    await deps.store.updateStatus(saved.id, 'sent')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await deps.store.updateStatus(saved.id, 'failed', message)
  }
}
