// Authenticated user routes (P08 — adds auth + preferences to the P07 heartbeat).
//   POST  /user/heartbeat                → bumps the logged-in user's last_seen
//   POST  /user/preferences              { panel_language: 'es' | 'en' }
//   GET   /user/notification-preferences → the caller's normalized alert prefs
//   PUT   /user/notification-preferences { emailEnabled, mutedTypes } (Req 24)
// The timeout monitor reads last_seen to know whether a secretary is present;
// the notification worker reads notification_prefs to gate alert emails.
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createUsersRepository, createPushSubscriptionsRepository } from '@docmee/db'
import { isNotificationType, normalizeNotificationPrefs } from '@docmee/notifications'
import { withDb } from '../lib/db.js'
import { validate } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'

const preferencesSchema = z.object({ panel_language: z.enum(['es', 'en']) })

const notificationPrefsSchema = z.object({
  emailEnabled: z.boolean(),
  // Only known alert types may be muted; unknown values are rejected so a typo
  // can't silently fail to mute. p1 alerts are never muted (enforced at dispatch).
  mutedTypes: z.array(z.string().refine(isNotificationType, 'unknown alert type')),
})

// A browser PushManager subscription (Req 39 — installed-PWA mobile alerts).
const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

const pushUnsubscribeSchema = z.object({ endpoint: z.string().url() })

const userRoute: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth)

  app.post('/heartbeat', async (request, reply) => {
    const userId = request.user!.userId
    const ok = await withDb(async (sql) => createUsersRepository(sql).touchLastSeen(userId))
    if (!ok) return reply.code(404).send({ error: 'User not found' })
    return { ok: true }
  })

  app.post('/preferences', async (request, reply) => {
    const parsed = validate(preferencesSchema, request.body, reply)
    if (!parsed.ok) return
    const userId = request.user!.userId
    const ok = await withDb(async (sql) =>
      createUsersRepository(sql).setPanelLanguage(userId, parsed.data.panel_language),
    )
    if (!ok) return reply.code(404).send({ error: 'User not found' })
    return { ok: true, panel_language: parsed.data.panel_language }
  })

  app.get('/notification-preferences', async (request, reply) => {
    const { userId, clinicId } = request.user!
    const raw = await withDb(async (sql) =>
      createUsersRepository(sql).getNotificationPrefs(clinicId, userId),
    )
    if (raw === null) return reply.code(404).send({ error: 'User not found' })
    return { preferences: normalizeNotificationPrefs(raw) }
  })

  app.put('/notification-preferences', async (request, reply) => {
    const parsed = validate(notificationPrefsSchema, request.body, reply)
    if (!parsed.ok) return
    const userId = request.user!.userId
    // Normalize (dedupe the muted list) before persisting so the stored row is canonical.
    const prefs = normalizeNotificationPrefs(parsed.data)
    const ok = await withDb(async (sql) =>
      createUsersRepository(sql).setNotificationPrefs(
        userId,
        prefs as unknown as Record<string, unknown>,
      ),
    )
    if (!ok) return reply.code(404).send({ error: 'User not found' })
    return { ok: true, preferences: prefs }
  })

  // ── Web Push (Req 39 — mobile alerts for the installed PWA) ────────────────
  // The browser needs the VAPID public key to create a matching subscription.
  app.get('/push/public-key', async () => {
    return { publicKey: process.env['VAPID_PUBLIC_KEY'] ?? null }
  })

  // Register (or refresh) a device subscription for the logged-in user.
  app.post('/push/subscriptions', async (request, reply) => {
    const parsed = validate(pushSubscriptionSchema, request.body, reply)
    if (!parsed.ok) return
    const { userId, clinicId, email } = request.user!
    await withDb(async (sql) =>
      createPushSubscriptionsRepository(sql).upsert({
        clinicId,
        userId,
        userEmail: email,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
      }),
    )
    return reply.code(201).send({ ok: true })
  })

  // Remove a device subscription (owner-scoped). Idempotent: a missing endpoint
  // still returns ok so the browser can disable notifications without an error.
  app.delete('/push/subscriptions', async (request, reply) => {
    const parsed = validate(pushUnsubscribeSchema, request.body, reply)
    if (!parsed.ok) return
    const { userId } = request.user!
    const removed = await withDb(async (sql) =>
      createPushSubscriptionsRepository(sql).deleteByEndpoint(userId, parsed.data.endpoint),
    )
    return { ok: true, removed }
  })
}

export default userRoute
