// Secretary-facing notification feed (P07 — replaces the P01 stub).
//   GET  /notifications?clinic_id=X     → 50 most recent, newest first
//   POST /notifications/:id/acknowledge → mark acknowledged
import type { FastifyPluginAsync } from 'fastify'
import { createServiceDbClient, createNotificationsRepository } from '@docmee/db'

function dbClient() {
  return createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })
}

const notificationsRoute: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { clinic_id?: string } }>('/', async (request, reply) => {
    const clinicId = request.query.clinic_id
    if (!clinicId) {
      return reply.code(400).send({ error: 'clinic_id is required' })
    }
    const sql = dbClient()
    try {
      const notifications = createNotificationsRepository(sql)
      const rows = await notifications.listByClinic(clinicId, 50)
      return { notifications: rows }
    } finally {
      await sql.end()
    }
  })

  app.post<{ Params: { id: string } }>('/:id/acknowledge', async (request, reply) => {
    const sql = dbClient()
    try {
      const notifications = createNotificationsRepository(sql)
      const updated = await notifications.acknowledge(request.params.id)
      if (!updated) return reply.code(404).send({ error: 'Notification not found' })
      return { acknowledged: true, notification: updated }
    } finally {
      await sql.end()
    }
  })
}

export default notificationsRoute
