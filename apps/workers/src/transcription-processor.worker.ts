// Consumes: transcription queue. Production voice-note pipeline (replaces the P01/P03 stub).
//
// Flow (per Decision: a voice note is treated exactly like the text the patient
// would have typed): download the WhatsApp audio → transcribe with Deepgram →
// re-enqueue to the agent queue as a normal message. The provider stub keeps the
// whole path working offline (LLM_STUB=true).
//
// Resilience: each step is retried up to MAX_RETRIES with exponential backoff.
// If every attempt fails we record an operator-reviewable error and send the
// patient a short apology asking them to retype — we never leave them on read.
import { z } from 'zod'
import { type Job } from '@docmee/queue'
import { agentQueue } from '@docmee/queue'
import { downloadMedia, deepgramProvider, sendWhatsAppText } from '@docmee/channels'
import type { TranscriptionResult } from '@docmee/channels'
import {
  createServiceDbClient,
  createErrorReviewsRepository,
  createChannelAccountsRepository,
  createConversationsRepository,
  createMessagesRepository,
} from '@docmee/db'

// messageId is the inbound WhatsApp message id (wamid.*), not a DB uuid — keep it a
// plain string so real jobs from the conversation processor validate.
const TranscriptionJobSchema = z.object({
  clinicId: z.string().uuid(),
  patientId: z.string().uuid().optional(),
  patientWaId: z.string(),
  messageId: z.string(),
  mediaId: z.string(),
  mimeType: z.string().optional(),
  waAccessToken: z.string(),
  conversationId: z.string().uuid().optional(),
})

export type TranscriptionJob = z.infer<typeof TranscriptionJobSchema>

const MAX_RETRIES = 3
const DEFAULT_RETRY_DELAY_MS = 1000

function retryDelayMs(): number {
  const raw = Number(process.env['TRANSCRIPTION_RETRY_DELAY_MS'])
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_RETRY_DELAY_MS
}

const APOLOGY_TEXT = 'No pude procesar tu mensaje de voz. Por favor envíalo como texto.'

export async function processTranscriptionJob(job: Job): Promise<void> {
  const payload = TranscriptionJobSchema.parse(job.data)

  let result: TranscriptionResult | null = null
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 1. Download the audio from the WhatsApp Cloud API.
      const media = await downloadMedia(payload.mediaId, payload.waAccessToken)

      // 2. Transcribe (Deepgram Nova-3, or the stub under LLM_STUB).
      result = await deepgramProvider.transcribe(media.buffer, media.mimeType, {
        language: 'es',
      })
      break // success — don't pay for another download/transcription
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.warn(
        `[transcription] attempt ${attempt}/${MAX_RETRIES} failed for ${payload.messageId}: ${lastError.message}`,
      )
      if (attempt < MAX_RETRIES) await sleep(retryDelayMs() * attempt)
    }
  }

  if (!result) {
    // All retries exhausted: log for operator review and apologise to the patient.
    await handleFailure(payload, lastError)
    return
  }

  // 3. Cost tracking: surface audio minutes for the runtime cost ledger
  //    (mirrors `pnpm tool cost log --provider deepgram --minutes N`).
  console.info('[transcription] deepgram usage', {
    clinicId: payload.clinicId,
    minutes: Number((result.duration_seconds / 60).toFixed(4)),
    confidence: result.confidence,
  })

  // 4. Persist the voice note + transcript (Req 8: transcript storage + inbox
  //    voice marker). This resolves/creates the patient's open conversation so the
  //    note shows up in the inbox as an `audio` message carrying its transcription.
  //    Storage failures must not swallow the patient's message, so we fall back to
  //    the previous behaviour (enqueue without a conversation id) if it fails.
  const conversationId = await storeVoiceNote(payload, result)

  // 5. Re-enqueue to the agent as if the patient had typed the transcript, threaded
  //    onto the same conversation so the bot reply stays in the inbox thread.
  await agentQueue.add('process', {
    clinicId: payload.clinicId,
    patientId: payload.patientId,
    patientWaId: payload.patientWaId,
    message: result.text,
    waMessageId: payload.messageId,
    conversationId: conversationId ?? payload.conversationId,
    isVoiceNote: true,
  })
}

/**
 * Store the inbound voice note as an `audio` conversation message carrying the
 * Deepgram transcript, on the patient's open conversation (created if needed).
 * Returns the conversation id, or null if persistence failed (logged, non-fatal).
 */
async function storeVoiceNote(
  payload: TranscriptionJob,
  result: TranscriptionResult,
): Promise<string | null> {
  const sql = createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })
  try {
    const conversations = createConversationsRepository(sql)
    // Audio only reaches the transcription worker on WhatsApp (P14/P15 inbound is
    // text-only), so the conversation channel is always 'whatsapp' here.
    const existing =
      (payload.conversationId
        ? await conversations.findById(payload.clinicId, payload.conversationId)
        : null) ?? (await conversations.findOpenByContact(payload.clinicId, 'whatsapp', payload.patientWaId))

    const conversation =
      existing ??
      (await conversations.create({
        clinicId: payload.clinicId,
        patientId: payload.patientId,
        channel: 'whatsapp',
        channelContactHandle: payload.patientWaId,
      }))

    await createMessagesRepository(sql).create({
      conversationId: conversation.id,
      clinicId: payload.clinicId,
      role: 'user',
      content: result.text,
      contentType: 'audio',
      channelMessageId: payload.messageId,
      transcription: result.text,
      metadata: {
        isVoiceNote: true,
        mediaId: payload.mediaId,
        mimeType: payload.mimeType ?? null,
        durationSeconds: result.duration_seconds,
        confidence: result.confidence,
      },
    })

    return conversation.id
  } catch (err) {
    console.error('[transcription] failed to persist voice note:', err)
    return null
  } finally {
    await sql.end()
  }
}

async function handleFailure(payload: TranscriptionJob, lastError: Error | null): Promise<void> {
  const sql = createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })
  try {
    await createErrorReviewsRepository(sql).create({
      clinicId: payload.clinicId,
      errorType: 'transcription_failure',
      errorMessage: lastError?.message ?? 'unknown transcription error',
      context: {
        mediaId: payload.mediaId,
        waMessageId: payload.messageId,
        conversationId: payload.conversationId ?? null,
      },
    })

    // Send the apology on the clinic's active WhatsApp number. Failure here is
    // swallowed — we have already recorded the underlying problem.
    try {
      const accounts = await createChannelAccountsRepository(sql).listByClinic(payload.clinicId)
      const account = accounts.find((a) => a.channel === 'whatsapp' && a.status === 'active')
      if (account) {
        await sendWhatsAppText(
          account.accountId,
          payload.waAccessToken || (account.accessTokenEnc ?? ''),
          payload.patientWaId,
          APOLOGY_TEXT,
        )
      }
    } catch (sendErr) {
      console.error('[transcription] failed to send apology:', sendErr)
    }
  } finally {
    await sql.end()
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
