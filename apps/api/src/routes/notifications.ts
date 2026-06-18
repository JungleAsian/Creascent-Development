import type { FastifyPluginAsync } from 'fastify'

const notificationsRoute: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    return { notifications: [] }
  })

  app.post('/', async (_request, reply) => {
    reply.code(201).send({ created: false, stub: true })
  })
}

export default notificationsRoute
