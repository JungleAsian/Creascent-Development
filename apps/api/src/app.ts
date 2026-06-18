import Fastify from 'fastify'
import { parseEnv } from './plugins/env.js'
import { errorHandler, notFoundHandler } from './plugins/errors.js'
import healthRoute from './routes/health.js'
import webhookRoute from './routes/webhook.js'
import messengerRoute from './routes/messenger.js'
import authRoute from './routes/auth.js'
import clinicsRoute from './routes/clinics.js'
import conversationsRoute from './routes/conversations.js'
import patientsRoute from './routes/patients.js'
import kbRoute from './routes/kb.js'
import notificationsRoute from './routes/notifications.js'
import calendarRoute from './routes/calendar.js'
import userRoute from './routes/user.js'
import errorsRoute from './routes/errors.js'
import usageRoute from './routes/usage.js'
import licenseRoute from './routes/license.js'

export async function buildApp() {
  const env = parseEnv()

  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: 'info' },
  })

  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler(notFoundHandler)

  await app.register(healthRoute)
  await app.register(authRoute, { prefix: '/auth' })
  await app.register(webhookRoute, { prefix: '/webhook' })
  await app.register(messengerRoute, { prefix: '/webhook' })
  await app.register(clinicsRoute, { prefix: '/clinics' })
  await app.register(conversationsRoute, { prefix: '/conversations' })
  // patients + kb declare their own /clinics/:id/… and /patients/… paths.
  await app.register(patientsRoute)
  await app.register(kbRoute)
  // errors declares its own /clinics/:id/errors… paths
  await app.register(errorsRoute)
  // usage + license declare their own /clinics/:id/… and /usage/… paths
  await app.register(usageRoute)
  await app.register(licenseRoute)
  await app.register(notificationsRoute, { prefix: '/notifications' })
  await app.register(calendarRoute)
  await app.register(userRoute, { prefix: '/user' })

  return app
}
