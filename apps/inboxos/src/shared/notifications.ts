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
