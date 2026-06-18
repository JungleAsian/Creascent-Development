import type { FastifyPluginAsync } from 'fastify'

const healthRoute: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    return { ok: true, service: 'docmee-api' }
  })

  app.get('/heartbeat', async () => {
    return { ok: true, ts: new Date().toISOString() }
  })
}

export default healthRoute
