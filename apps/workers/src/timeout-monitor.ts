// Background timeout detection (Gap: secretary inactivity + stale conversations).
// Runs on an interval from index.ts. Two alert checks, both deduped per
// conversation so a long-stale conversation alerts at most once per
// DEDUP_WINDOW_MINUTES, plus a bot-reactivation pass:
//   1. SECRETARY_TIMEOUT  — a human-handled conversation (status handoff/assigned)
//      with no message in > SECRETARY_TIMEOUT_MINUTES.
//   2. STALE_CONVERSATION — an open conversation with no reply in > STALE_MINUTES.
//   3. BOT_REACTIVATION   — an auto-paused conversation (status handoff, never
//      assigned to a person) idle past BOT_REACTIVATION_MINUTES returns to the
//      bot (status → open) so it can answer again (Rev1 #5/#6).
import {
  dispatchNotification,
  NOTIFICATION_TYPES,
  type NotificationType,
} from '@docmee/notifications'
import {
  createServiceDbClient,
  createConversationsRepository,
  createNotificationsRepository,
  createUsersRepository,
  type Conversation,
} from '@docmee/db'
import { buildNotificationStore } from './notification-store.js'

export const SECRETARY_TIMEOUT_MINUTES = 10
export const STALE_MINUTES = 30
export const BOT_REACTIVATION_MINUTES = 60
const DEDUP_WINDOW_MINUTES = 60

/**
 * A handoff is *auto-paused* (eligible for bot reactivation) when the bot paused
 * it (metadata.botPausedAt) and no human deliberately claimed it (assignedTo
 * null). Conversations a secretary explicitly assigned stay human-owned.
 */
export function isAutoPausedHandoff(conv: Conversation): boolean {
  return (
    conv.status === 'handoff' &&
    conv.assignedTo === null &&
    typeof (conv.metadata as { botPausedAt?: unknown }).botPausedAt === 'string'
  )
}

export async function runTimeoutChecks(): Promise<void> {
  const sql = createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })
  try {
    const conversations = createConversationsRepository(sql)
    const notifications = createNotificationsRepository(sql)
    const users = createUsersRepository(sql)
    const store = buildNotificationStore(notifications)

    // Resolve (and cache) the alert recipient per clinic for this run.
    const recipientCache = new Map<string, string | null>()
    const recipientFor = async (clinicId: string): Promise<string | null> => {
      if (!recipientCache.has(clinicId)) {
        const email =
          (await users.findPrimaryEmail(clinicId)) ?? process.env['ALERT_FALLBACK_EMAIL'] ?? null
        recipientCache.set(clinicId, email)
      }
      return recipientCache.get(clinicId) ?? null
    }

    const alertFor = async (conv: Conversation, type: NotificationType): Promise<void> => {
      if (await notifications.existsRecent(conv.clinicId, conv.id, type, DEDUP_WINDOW_MINUTES)) {
        return // already alerted recently
      }
      const recipientEmail = await recipientFor(conv.clinicId)
      if (!recipientEmail) {
        console.warn(`[timeout-monitor] no recipient for clinic ${conv.clinicId}; skipping ${type}`)
        return
      }
      await dispatchNotification(
        {
          clinicId: conv.clinicId,
          conversationId: conv.id,
          type,
          data: { conversationId: conv.id, status: conv.status, lastMessageAt: conv.lastMessageAt },
          recipientEmail,
        },
        { store },
      )
    }

    const timedOut = await conversations.listStale(['handoff', 'assigned'], SECRETARY_TIMEOUT_MINUTES)
    for (const conv of timedOut) await alertFor(conv, NOTIFICATION_TYPES.SECRETARY_TIMEOUT)

    const stale = await conversations.listStale(['open'], STALE_MINUTES)
    for (const conv of stale) await alertFor(conv, NOTIFICATION_TYPES.STALE_CONVERSATION)

    // Bot reactivation (Rev1 #5/#6): hand auto-paused, unclaimed conversations
    // back to the bot once the patient/secretary have gone quiet long enough.
    const reactivatable = await conversations.listStale(['handoff'], BOT_REACTIVATION_MINUTES)
    for (const conv of reactivatable.filter(isAutoPausedHandoff)) {
      const metadata = { ...conv.metadata, botReactivatedAt: new Date().toISOString() }
      delete (metadata as { botPausedAt?: unknown }).botPausedAt
      delete (metadata as { handoffReason?: unknown }).handoffReason
      await conversations.update(conv.clinicId, conv.id, { status: 'open', metadata })
    }
  } catch (err) {
    // A monitor tick must never crash the worker process.
    console.error('[timeout-monitor] check failed:', err instanceof Error ? err.message : err)
  } finally {
    await sql.end()
  }
}
