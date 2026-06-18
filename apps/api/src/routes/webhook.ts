import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { whatsappInboundQueue } from '@docmee/queue'
import { validateHmacSignature } from '../lib/hmac.js'

type RawBodyRequest = FastifyRequest & { rawBody?: Buffer }

// WhatsApp Cloud API inbound payload (the subset we act on).
const WhatsAppEntrySchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.literal('messages'),
          value: z.object({
            messaging_product: z.literal('whatsapp'),
            metadata: z.object({
              display_phone_number: z.string(),
              phone_number_id: z.string(),
            }),
            contacts: z
              .array(z.object({ profile: z.object({ name: z.string() }), wa_id: z.string() }))
              .optional(),
            messages: z
              .array(
                z.object({
                  from: z.string(),
                  id: z.string(),
                  timestamp: z.string(),
                  type: z.enum(['text', 'audio', 'image', 'document', 'button', 'interactive']),
                  text: z.object({ body: z.string() }).optional(),
                  audio: z.object({ id: z.string(), mime_type: z.string() }).optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
})

const webhookRoute: FastifyPluginAsync = async (app) => {
  // Capture the raw body so HMAC validation sees exactly what Meta signed.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    ;(req as RawBodyRequest).rawBody = body as Buffer
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')))
    } catch (err) {
      done(err as Error)
    }
  })

  // GET — Meta verification challenge.
  app.get('/whatsapp', async (request, reply) => {
    const q = request.query as Record<string, string>
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === process.env['META_VERIFY_TOKEN']) {
      return reply.code(200).send(q['hub.challenge'])
    }
    return reply.code(403).send({ error: 'Forbidden' })
  })

  // POST — inbound messages. Always answer 200 fast; Meta retries otherwise.
  app.post('/whatsapp', async (request, reply) => {
    reply.code(200).send()

    try {
      const rawBody = (request as RawBodyRequest).rawBody ?? Buffer.from('')
      const signature = request.headers['x-hub-signature-256'] as string | undefined
      const secret = process.env['META_APP_SECRET'] ?? ''

      if (!validateHmacSignature(rawBody, signature, secret)) {
        app.log.warn('[webhook] invalid HMAC signature — ignoring')
        return
      }

      const parsed = WhatsAppEntrySchema.safeParse(request.body)
      if (!parsed.success) {
        app.log.warn(`[webhook] invalid payload shape: ${parsed.error.message}`)
        return
      }

      for (const entry of parsed.data.entry) {
        for (const change of entry.changes) {
          const { metadata, messages, contacts } = change.value
          if (!messages?.length) continue
          for (const msg of messages) {
            await whatsappInboundQueue.add('inbound', {
              phoneNumberId: metadata.phone_number_id,
              patientWaId: msg.from,
              patientName: contacts?.[0]?.profile.name ?? '',
              messageType: msg.type,
              content: msg.text?.body,
              mediaId: msg.audio?.id,
              mimeType: msg.audio?.mime_type,
              waMessageId: msg.id,
              timestamp: Number.parseInt(msg.timestamp, 10),
            })
          }
        }
      }
    } catch (err) {
      app.log.error(`[webhook] processing failed: ${(err as Error).message}`)
    }
  })
}

export default webhookRoute
