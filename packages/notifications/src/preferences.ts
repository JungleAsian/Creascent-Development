// Per-user notification preferences (Rev1 #24).
//
// A clinic user can mute the EMAIL channel for non-urgent alerts. Two knobs:
//   • emailEnabled — master switch for alert emails (default true).
//   • mutedTypes   — specific alert types the user does not want emailed.
//
// IMPORTANT: these gate ONLY the email channel. The in-panel bell feed always
// records every alert (see ./routing.ts — panel is unconditionally true), so a
// muted alert still shows in the bell; the user just won't get the email. And
// urgent (p1) alerts are NEVER suppressed by prefs — that rule lives in
// routeNotification, so emergencies/handoffs always email regardless of prefs.
//
// This module is pure (no DB): the worker reads the stored JSON from
// clinic_users.notification_prefs and feeds it in.
import type { NotificationType } from './notification-types.js'
import { isNotificationType } from './notification-types.js'

export interface NotificationPrefs {
  /** Master switch for alert emails. */
  emailEnabled: boolean
  /** Alert types the user has opted out of receiving by email. */
  mutedTypes: NotificationType[]
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  emailEnabled: true,
  mutedTypes: [],
}

/**
 * Coerce an untrusted stored or posted value into a well-formed NotificationPrefs.
 * Missing or malformed keys fall back to the permissive default (email on, nothing
 * muted) so a bad row can never silently swallow a secretary's alerts. Unknown
 * alert-type strings in mutedTypes are dropped.
 */
export function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_NOTIFICATION_PREFS }
  const obj = raw as Record<string, unknown>
  const emailEnabled = obj['emailEnabled'] === false ? false : true
  const mutedRaw = Array.isArray(obj['mutedTypes']) ? obj['mutedTypes'] : []
  const mutedTypes = mutedRaw.filter(
    (v): v is NotificationType => typeof v === 'string' && isNotificationType(v),
  )
  return { emailEnabled, mutedTypes: [...new Set(mutedTypes)] }
}

/**
 * Whether the user's prefs allow an email for `type`. This is the user-pref gate
 * only — it does NOT account for priority/presence (routeNotification owns that,
 * and forces p1 emails through regardless). Returns false when the master switch
 * is off or the type is explicitly muted.
 */
export function isEmailAllowedByPrefs(prefs: NotificationPrefs, type: NotificationType): boolean {
  if (!prefs.emailEnabled) return false
  return !prefs.mutedTypes.includes(type)
}
