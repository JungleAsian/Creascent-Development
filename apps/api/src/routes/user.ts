// Authenticated user routes (P08 — adds auth + preferences to the P07 heartbeat).
//   POST  /user/heartbeat                → bumps the logged-in user's last_seen
//   POST  /user/preferences              { panel_language: 'es' | 'en' }
//   GET   /user/notification-preferences → the caller's normalized alert prefs
//   PUT   /user/notification-preferences { emailEnabled, mutedTypes } (Req 24)
// The timeout monitor reads last_seen to know whether a secretary is present;
// the notification worker reads notification_prefs to gate alert emails.
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createUsersRepository } from '@docmee/db'
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
}

export default userRoute
