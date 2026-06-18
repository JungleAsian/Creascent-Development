// Secretary presence (P07 — replaces the P01 heartbeat stub).
//   POST /user/heartbeat { clinicUserId } → bumps clinic_users.last_seen
// The timeout monitor reads last_seen to know whether a secretary is present.
import type { FastifyPluginAsync } from 'fastify'
import { createServiceDbClient, createUsersRepository } from '@docmee/db'

const userRoute: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { clinicUserId?: string } }>('/heartbeat', async (request, reply) => {
    const clinicUserId = request.body?.clinicUserId
    if (!clinicUserId) {
      return reply.code(400).send({ error: 'clinicUserId is required' })
    }
    const sql = createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })
    try {
      const users = createUsersRepository(sql)
      const ok = await users.touchLastSeen(clinicUserId)
      if (!ok) return reply.code(404).send({ error: 'User not found' })
      return { ok: true }
    } finally {
      await sql.end()
    }
  })
}

export default userRoute
