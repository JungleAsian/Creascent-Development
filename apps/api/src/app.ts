import Fastify from 'fastify'
import { parseEnv } from './plugins/env.js'
import { errorHandler, notFoundHandler } from './plugins/errors.js'
import healthRoute from './routes/health.js'
import configRoute from './routes/config.js'
import webhookRoute from './routes/webhook.js'
import messengerRoute from './routes/messenger.js'
import instagramRoute from './routes/instagram.js'
import authRoute from './routes/auth.js'
import clinicsRoute from './routes/clinics.js'
import conversationsRoute from './routes/conversations.js'
import patientsRoute from './routes/patients.js'
import kbRoute from './routes/kb.js'
import notificationsRoute from './routes/notifications.js'
import calendarRoute from './routes/calendar.js'
import userRoute from './routes/user.js'
import usersRoute from './routes/users.js'
import errorsRoute from './routes/errors.js'
import usageRoute from './routes/usage.js'
import licenseRoute from './routes/license.js'
import quickRepliesRoute from './routes/quick-replies.js'
import metricsRoute from './routes/metrics.js'
import templatesRoute from './routes/templates.js'
import doctorsRoute from './routes/doctors.js'
import customFlowsRoute from './routes/custom-flows.js'
import kbUploadRoute from './routes/kb-upload.js'
import analyticsRoute from './routes/analytics.js'
import qosRoute from './routes/qos.js'
import reportsRoute from './routes/reports.js'
import reviewsRoute from './routes/reviews.js'

export async function buildApp() {
  const env = parseEnv()

  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: 'info' },
  })

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin
    const allowedOrigins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000,http://127.0.0.1:3000')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    const isAllowed = origin && (allowedOrigins.includes(origin) || /^http:\/\/100\.\d{1,3}\.\d{1,3}\.\d{1,3}:3000$/.test(origin))
    if (isAllowed) reply.header('access-control-allow-origin', origin)
    reply.header('vary', 'Origin')
    reply.header('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    reply.header('access-control-allow-headers', 'content-type,authorization')
    if (request.method === 'OPTIONS') {
      reply.status(204).send()
    }
  })

  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler(notFoundHandler)

  await app.register(healthRoute)
  await app.register(configRoute)
  await app.register(authRoute, { prefix: '/auth' })
  await app.register(webhookRoute, { prefix: '/webhook' })
  await app.register(messengerRoute, { prefix: '/webhook' })
  await app.register(instagramRoute, { prefix: '/webhook' })
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
  // quick replies, metrics + message templates declare their own /clinics/:id/… paths
  await app.register(quickRepliesRoute)
  await app.register(metricsRoute)
  await app.register(templatesRoute)
  // P18 — Phase 3 routes. doctors/custom-flows/kb-upload/analytics declare their own
  // /clinics/:id/… paths; reviews exposes the public /r/:id review redirector.
  await app.register(doctorsRoute)
  await app.register(customFlowsRoute)
  await app.register(kbUploadRoute)
  await app.register(analyticsRoute)
  await app.register(qosRoute)
  await app.register(reportsRoute)
  await app.register(reviewsRoute)
  await app.register(notificationsRoute, { prefix: '/notifications' })
  await app.register(calendarRoute)
  await app.register(userRoute, { prefix: '/user' })
  await app.register(usersRoute)

  return app
}
