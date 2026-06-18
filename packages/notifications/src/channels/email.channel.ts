// Only file permitted to import resend (enforced by ESLint no-direct-resend rule)
import type { NotificationChannel } from '../index.js'

export function createEmailChannel(_config: { apiKey: string; from: string }): NotificationChannel {
  throw new Error('EmailChannel: not implemented — add resend sdk in P06+')
}
