import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { whatsappInboundQueue } from '@docmee/queue'
import { validateHmacSignature } from '../lib/hmac.js'

type RawBodyRequest = FastifyRequest & { rawBody?: Buffer }

// Facebook Messenger inbound payload (the subset we act on). Inbound messages
// arrive under object='page' with a `messaging` array per entry.
const MessengerEntrySchema = z.object({
  object: z.literal('page'),
  entry: z.array(
    z.object({
      id: z.string(), // Page id
      time: z.number().optional(),
      messaging: z
        .array(
          z.object({
            sender: z.object({ id: z.string() }), // patient PSID
            recipient: z.object({ id: z.string() }), // Page id
            timestamp: z.number().optional(),
            message: z
              .object({
                mid: z.string(),
                text: z.string().optional(),
                is_echo: z.boolean().optional(),
              })
              .optional(),
          }),
        )
        .optional(),
    }),
  ),
})

const messengerRoute: FastifyPluginAsync = async (app) => {
  // Capture the raw body so HMAC validation sees exactly what Meta signed.
  // Encapsulated to this plugin, so it does not clash with the WhatsApp webhook.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    ;(req as RawBodyRequest).rawBody = body as Buffer
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')))
    } catch (err) {
      done(err as Error)
    }
  })

  // GET — Meta verification challenge.
  app.get('/messenger', async (request, reply) => {
    const q = request.query as Record<string, string>
    if (
      q['hub.mode'] === 'subscribe' &&
      q['hub.verify_token'] === process.env['META_VERIFY_TOKEN']
    ) {
      return reply.code(200).send(q['hub.challenge'])
    }
    return reply.code(403).send({ error: 'Forbidden' })
  })

  // POST — inbound messages. Always answer 200 fast; Meta retries otherwise.
  app.post('/messenger', async (request, reply) => {
    reply.code(200).send()

    try {
      const rawBody = (request as RawBodyRequest).rawBody ?? Buffer.from('')
      const signature = request.headers['x-hub-signature-256'] as string | undefined
      const secret = process.env['META_APP_SECRET'] ?? ''

      if (!validateHmacSignature(rawBody, signature, secret)) {
        app.log.warn('[messenger] invalid HMAC signature — ignoring')
        return
      }

      const parsed = MessengerEntrySchema.safeParse(request.body)
      if (!parsed.success) {
        app.log.warn(`[messenger] invalid payload shape: ${parsed.error.message}`)
        return
      }

      for (const entry of parsed.data.entry) {
        for (const event of entry.messaging ?? []) {
          // Skip echoes (our own outbound) and non-text/empty events.
          if (!event.message || event.message.is_echo || !event.message.text) continue
          await whatsappInboundQueue.add('inbound', {
            channel: 'messenger',
            phoneNumberId: event.recipient.id, // Page id — resolves the clinic
            patientWaId: event.sender.id, // patient PSID
            patientName: '',
            messageType: 'text',
            content: event.message.text,
            waMessageId: event.message.mid,
            timestamp: event.timestamp ?? 0,
          })
        }
      }
    } catch (err) {
      app.log.error(`[messenger] processing failed: ${(err as Error).message}`)
    }
  })
}

export default messengerRoute
