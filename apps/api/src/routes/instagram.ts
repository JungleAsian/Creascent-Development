import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { whatsappInboundQueue } from '@docmee/queue'
import { validateHmacSignature } from '../lib/hmac.js'

type RawBodyRequest = FastifyRequest & { rawBody?: Buffer }

// Instagram Direct inbound payload (the subset we act on). Instagram messaging
// rides the same shape as Messenger but under object='instagram'; the sender id
// is an IGSID and the recipient id is the clinic's Instagram account id.
const InstagramEntrySchema = z.object({
  object: z.literal('instagram'),
  entry: z.array(
    z.object({
      id: z.string(), // Instagram account id
      time: z.number().optional(),
      messaging: z
        .array(
          z.object({
            sender: z.object({ id: z.string() }), // patient IGSID
            recipient: z.object({ id: z.string() }), // Instagram account id
            timestamp: z.number().optional(),
            // Reactions arrive under `reaction` (no `message`); we ignore them.
            reaction: z.object({}).passthrough().optional(),
            message: z
              .object({
                mid: z.string(),
                text: z.string().optional(),
                is_echo: z.boolean().optional(),
                // Story replies/mentions carry a `reply_to.story` — not a medical inquiry.
                reply_to: z
                  .object({ story: z.object({}).passthrough().optional() })
                  .passthrough()
                  .optional(),
              })
              .optional(),
          }),
        )
        .optional(),
    }),
  ),
})

const instagramRoute: FastifyPluginAsync = async (app) => {
  // Capture the raw body so HMAC validation sees exactly what Meta signed.
  // Encapsulated to this plugin, so it does not clash with the other webhooks.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    ;(req as RawBodyRequest).rawBody = body as Buffer
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')))
    } catch (err) {
      done(err as Error)
    }
  })

  // GET — Meta verification challenge.
  app.get('/instagram', async (request, reply) => {
    const q = request.query as Record<string, string>
    if (
      q['hub.mode'] === 'subscribe' &&
      q['hub.verify_token'] === process.env['META_VERIFY_TOKEN']
    ) {
      return reply.code(200).send(q['hub.challenge'])
    }
    return reply.code(403).send({ error: 'Forbidden' })
  })

  // POST — inbound DMs. Always answer 200 fast; Meta retries otherwise.
  app.post('/instagram', async (request, reply) => {
    reply.code(200).send()

    try {
      const rawBody = (request as RawBodyRequest).rawBody ?? Buffer.from('')
      const signature = request.headers['x-hub-signature-256'] as string | undefined
      const secret = process.env['META_APP_SECRET'] ?? ''

      if (!validateHmacSignature(rawBody, signature, secret)) {
        app.log.warn('[instagram] invalid HMAC signature — ignoring')
        return
      }

      const parsed = InstagramEntrySchema.safeParse(request.body)
      if (!parsed.success) {
        app.log.warn(`[instagram] invalid payload shape: ${parsed.error.message}`)
        return
      }

      for (const entry of parsed.data.entry) {
        for (const event of entry.messaging ?? []) {
          // Ignore reactions, echoes (our own outbound), story replies, and
          // empty/non-text events — none are patient inquiries.
          if (event.reaction) continue
          if (!event.message || event.message.is_echo || !event.message.text) continue
          if (event.message.reply_to?.story) continue
          await whatsappInboundQueue.add('inbound', {
            channel: 'instagram',
            phoneNumberId: event.recipient.id, // Instagram account id — resolves the clinic
            patientWaId: event.sender.id, // patient IGSID
            patientName: '',
            messageType: 'text',
            content: event.message.text,
            waMessageId: event.message.mid,
            timestamp: event.timestamp ?? 0,
          })
        }
      }
    } catch (err) {
      app.log.error(`[instagram] processing failed: ${(err as Error).message}`)
    }
  })
}

export default instagramRoute
