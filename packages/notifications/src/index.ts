export type NotificationType = 'secretary_alert' | 'appointment_reminder' | 'system_alert'

export interface Notification {
  type: NotificationType
  to: string
  subject: string
  body: string
  clinicId?: string
}

export interface NotificationChannel {
  send(notification: Notification): Promise<void>
}

export interface NotificationRepo {
  findByClinic(clinicId: string): Promise<Notification[]>
  create(notification: Notification): Promise<void>
}

export { createEmailChannel } from './channels/email.channel.js'

export function createDiscordChannel(_config: { webhookUrl: string }): NotificationChannel {
  throw new Error('DiscordChannel: not implemented — wire Discord webhook in P06+')
}

export function createNotificationRepo(_client: unknown): NotificationRepo {
  throw new Error('NotificationRepo: not implemented — requires DbClient (P02+)')
}
