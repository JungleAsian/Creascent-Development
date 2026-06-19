// Consumes: whatsapp.status queue.
// Records WhatsApp delivery-status receipts (Req 3). Meta posts a `statuses`
// webhook for every outbound message as it moves through its lifecycle
// (sent → delivered → read) or fails. The webhook route fans each status out to
// this worker, which resolves the owning clinic from the phone_number_id, matches
// the wamid back to the persisted outbound (assistant) message, and appends a
// message_delivery_events row. A failed delivery is additionally logged to the
// Error Review area so an operator can see when a clinic's number stops delivering
// (e.g. an invalid/expired token or a message sent outside the 24-hour window).
import { z } from 'zod'
import { type Job } from '@docmee/queue'
import {
  createServiceDbClient,
  createChannelAccountsRepository,
  createMessagesRepository,
  createErrorReviewsRepository,
} from '@docmee/db'

export const DeliveryStatusSchema = z.object({
  phoneNumberId: z.string(),
  channelMessageId: z.string(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  recipientId: z.string().optional(),
  timestamp: z.number().optional(),
  errorTitle: z.string().optional(),
  errorCode: z.number().optional(),
})

export type DeliveryStatusJob = z.infer<typeof DeliveryStatusSchema>

export async function processDeliveryStatusJob(job: Job): Promise<void> {
  const data = DeliveryStatusSchema.parse(job.data)
  const sql = createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })

  try {
    // Resolve the owning clinic from the WhatsApp phone_number_id (same lookup the
    // inbound worker uses). A status for an unknown account is dropped.
    const account = await createChannelAccountsRepository(sql).findByAccount(
      'whatsapp',
      data.phoneNumberId,
    )
    if (!account) {
      console.warn(
        `[delivery-status] no WhatsApp account for phone_number_id=${data.phoneNumberId}; dropping ${data.channelMessageId}`,
      )
      return
    }
    const clinicId = account.clinicId

    const error =
      data.status === 'failed'
        ? [data.errorTitle, data.errorCode != null ? `(${data.errorCode})` : null]
            .filter(Boolean)
            .join(' ') || 'unknown'
        : null

    const matched = await createMessagesRepository(sql).recordDeliveryStatus(
      clinicId,
      data.channelMessageId,
      data.status,
      error,
    )

    if (!matched) {
      // A status for a message we never persisted (e.g. sent before this feature
      // shipped, or a manual send outside the bot). Nothing to attach it to.
      console.log(
        `[delivery-status] no outbound message for wamid=${data.channelMessageId} (clinic ${clinicId}); status=${data.status} ignored`,
      )
      return
    }

    // A failed delivery is operationally actionable — surface it in the Error
    // Review area (Req 29) so the clinic learns its number stopped delivering.
    // Best-effort: a logging failure never fails the job.
    if (data.status === 'failed') {
      await createErrorReviewsRepository(sql)
        .create({
          clinicId,
          errorType: 'whatsapp_delivery_failure',
          errorMessage: error ?? 'unknown',
          context: {
            channel: 'whatsapp',
            channelMessageId: data.channelMessageId,
            recipient: data.recipientId,
            errorCode: data.errorCode,
          },
        })
        .catch((err) => console.error('[delivery-status] failed to log delivery failure:', err))
    }
  } finally {
    await sql.end()
  }
}
