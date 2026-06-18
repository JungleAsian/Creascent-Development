import 'dotenv/config'
import Fastify from 'fastify'

const PORT = Number(process.env['LICENSEKIT_PORT']) || 3002
const app = Fastify({ logger: process.env['NODE_ENV'] !== 'test' })

app.get('/health', async () => {
  return { ok: true, service: 'docmee-licensekit' }
})

try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
