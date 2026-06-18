import type { FastifyPluginAsync } from 'fastify'

const webhookRoute: FastifyPluginAsync = async (app) => {
  app.get('/whatsapp', async (request, reply) => {
    const query = request.query as Record<string, string>
    const mode = query['hub.mode']
    const token = query['hub.verify_token']
    const challenge = query['hub.challenge']

    if (mode === 'subscribe' && token === process.env['META_VERIFY_TOKEN']) {
      reply.code(200).send(challenge)
      return
    }

    reply.code(403).send({ ok: false, error: 'Forbidden' })
  })

  app.post('/whatsapp', async (_request, reply) => {
    reply.code(200).send({ received: true })
  })
}

export default webhookRoute
