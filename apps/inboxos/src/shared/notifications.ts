// Frontend mirror of the secretary-alert taxonomy (Req 24). Mirrors the canonical
// map in @docmee/notifications/notification-types.ts — kept local so the Next app
// carries no workspace dependency on that package (same pattern as types.ts).
//
// Used by the notification bell (priority → icon/colour) and the preferences panel
// (only NON-p1 alerts can be muted; p1 safety alerts always email).
import type { TranslationKey } from './i18n'

export type AlertPriority = 'p1' | 'p2' | 'standard'

export const NOTIFICATION_PRIORITY: Record<string, AlertPriority> = {
  // P1 — urgent (always emailed, never mutable)
  emergency: 'p1',
  human_handoff_requested: 'p1',
  bot_failed: 'p1',
  upset_patient: 'p1',
  secretary_escalated: 'p1',
  // P2 — important
  new_patient: 'p2',
  booking_confirmed: 'p2',
  booking_cancelled: 'p2',
  booking_rescheduled: 'p2',
  opted_out: 'p2',
  appointment_reminder: 'p2',
  // Standard
  conversation_assigned: 'standard',
  conversation_resolved: 'standard',
  stale_conversation: 'standard',
  secretary_timeout: 'standard',
  meta_token_expiring: 'standard',
  daily_summary: 'standard',
  kb_miss_threshold: 'standard',
  license_expiring: 'standard',
  license_expired: 'standard',
}

/** All alert types, in display order. */
export const ALERT_TYPES = Object.keys(NOTIFICATION_PRIORITY)

/** Alert types a user may mute (p1 safety alerts always email and are excluded). */
export const MUTABLE_ALERT_TYPES = ALERT_TYPES.filter((t) => NOTIFICATION_PRIORITY[t] !== 'p1')

export function alertPriority(alertType: string | null | undefined): AlertPriority {
  return (alertType && NOTIFICATION_PRIORITY[alertType]) || 'standard'
}

/** i18n key for a human label of an alert type, e.g. notif.type.emergency. */
export function alertLabelKey(alertType: string): TranslationKey {
  return `notif.type.${alertType}` as TranslationKey
}

/** Tailwind dot colour by priority for the feed marker. */
export const PRIORITY_DOT: Record<AlertPriority, string> = {
  p1: 'bg-red-500',
  p2: 'bg-amber-500',
  standard: 'bg-gray-400',
}

/** Per-alert-type glyph for the feed row icon (Screen 11). Falls back to 🔔. */
const ALERT_ICON: Record<string, string> = {
  emergency: '🚑',
  human_handoff_requested: '🙋',
  bot_failed: '🤖',
  upset_patient: '😟',
  secretary_escalated: '⏫',
  new_patient: '🧑',
  booking_confirmed: '📅',
  booking_cancelled: '❌',
  booking_rescheduled: '🔁',
  opted_out: '🚫',
  appointment_reminder: '⏰',
  conversation_assigned: '📌',
  conversation_resolved: '✅',
  stale_conversation: '🕒',
  secretary_timeout: '⌛',
  meta_token_expiring: '🔑',
  daily_summary: '📊',
  kb_miss_threshold: '❓',
  license_expiring: '🔑',
  license_expired: '🔑',
}

export function alertIcon(alertType: string | null | undefined): string {
  return (alertType && ALERT_ICON[alertType]) || '🔔'
}

// Patient-safety alerts — an emergency keyword paused the bot. Always unmistakable
// (solid-red badge). Mirrors router.ts: emergency → bot silenced, routed to a human.
const SAFETY_ALERT_TYPES = new Set(['emergency'])
export function isSafetyAlert(alertType: string | null | undefined): boolean {
  return Boolean(alertType && SAFETY_ALERT_TYPES.has(alertType))
}

// Bot→human handoff alerts — the conversation needs a person (patient asked for one,
// the bot failed, or a secretary escalated). Surfaced with a handoff badge.
const HANDOFF_ALERT_TYPES = new Set([
  'human_handoff_requested',
  'bot_failed',
  'secretary_escalated',
])
export function isHandoffAlert(alertType: string | null | undefined): boolean {
  return Boolean(alertType && HANDOFF_ALERT_TYPES.has(alertType))
}

// Who is handling the conversation behind an alert, derived from the taxonomy
// (the alert type encodes it): safety/handoff/upset → a human is/should be in the
// loop; bot-driven patient events → the assistant handled it; everything else is a
// system/info notice with no conversation mode. Drives the Bot/Human-mode badge.
export type AlertHandling = 'human' | 'bot' | 'system'
const HUMAN_HANDLED = new Set([
  'emergency',
  'human_handoff_requested',
  'bot_failed',
  'upset_patient',
  'secretary_escalated',
])
const BOT_HANDLED = new Set([
  'new_patient',
  'booking_confirmed',
  'booking_cancelled',
  'booking_rescheduled',
  'appointment_reminder',
  'conversation_resolved',
])
export function alertHandling(alertType: string | null | undefined): AlertHandling {
  if (alertType && HUMAN_HANDLED.has(alertType)) return 'human'
  if (alertType && BOT_HANDLED.has(alertType)) return 'bot'
  return 'system'
}

/** Friendly channel label from metadata.channel (proper nouns — not translated). */
const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  webchat: 'Web chat',
  system: 'System',
  automation: 'Automation',
  calendar: 'Calendar',
}
export function channelLabel(channel: unknown): string | null {
  if (typeof channel !== 'string' || !channel) return null
  return CHANNEL_LABEL[channel] ?? channel.charAt(0).toUpperCase() + channel.slice(1)
}
