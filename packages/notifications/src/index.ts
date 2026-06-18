// @docmee/notifications — secretary-alert notification domain.
// Email delivery (resend), the 17-type alert taxonomy, email templates, and the
// dispatcher. DB persistence is injected by the worker (keeps this package free
// of @docmee/db, mirroring the agents-package DI pattern).

export {
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITY,
  isNotificationType,
  type NotificationType,
  type NotificationPriority,
} from './notification-types.js'

export { sendEmail, type SendEmailParams, type SendEmailFn } from './channels/email.channel.js'

export { buildNotificationEmail, type NotificationEmail } from './templates.js'

export {
  dispatchNotification,
  type DispatchNotificationParams,
  type DispatchNotificationDeps,
  type NotificationStore,
} from './dispatcher.js'
