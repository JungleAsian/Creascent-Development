import Fastify from 'fastify'
import { parseEnv } from './plugins/env.js'
import { errorHandler, notFoundHandler } from './plugins/errors.js'
import healthRoute from './routes/health.js'
import webhookRoute from './routes/webhook.js'
import notificationsRoute from './routes/notifications.js'

export async function buildApp() {
  const env = parseEnv()

  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: 'info' },
  })

  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler(notFoundHandler)

  await app.register(healthRoute)
  await app.register(webhookRoute, { prefix: '/webhook' })
  await app.register(notificationsRoute, { prefix: '/notifications' })

  return app
}
