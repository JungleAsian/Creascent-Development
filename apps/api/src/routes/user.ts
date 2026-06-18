// Authenticated user routes (P08 — adds auth + preferences to the P07 heartbeat).
//   POST /user/heartbeat     → bumps the logged-in user's last_seen
//   POST /user/preferences   { panel_language: 'es' | 'en' }
// The timeout monitor reads last_seen to know whether a secretary is present.
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createUsersRepository } from '@docmee/db'
import { withDb } from '../lib/db.js'
import { validate } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'

const preferencesSchema = z.object({ panel_language: z.enum(['es', 'en']) })

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
}

export default userRoute
