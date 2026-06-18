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
import {
  createServiceDbClient,
  createErrorReviewsRepository,
  createChannelAccountsRepository,
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

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 1. Download the audio from the WhatsApp Cloud API.
      const media = await downloadMedia(payload.mediaId, payload.waAccessToken)

      // 2. Transcribe (Deepgram Nova-3, or the stub under LLM_STUB).
      const result = await deepgramProvider.transcribe(media.buffer, media.mimeType, {
        language: 'es',
      })

      // 3. Cost tracking: surface audio minutes for the runtime cost ledger
      //    (mirrors `pnpm tool cost log --provider deepgram --minutes N`).
      console.info('[transcription] deepgram usage', {
        clinicId: payload.clinicId,
        minutes: Number((result.duration_seconds / 60).toFixed(4)),
        confidence: result.confidence,
      })

      // 4. Re-enqueue to the agent as if the patient had typed the transcript.
      await agentQueue.add('process', {
        clinicId: payload.clinicId,
        patientId: payload.patientId,
        patientWaId: payload.patientWaId,
        message: result.text,
        waMessageId: payload.messageId,
        conversationId: payload.conversationId,
        isVoiceNote: true,
      })

      return // success
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.warn(
        `[transcription] attempt ${attempt}/${MAX_RETRIES} failed for ${payload.messageId}: ${lastError.message}`,
      )
      if (attempt < MAX_RETRIES) await sleep(retryDelayMs() * attempt)
    }
  }

  // All retries exhausted: log for operator review and apologise to the patient.
  await handleFailure(payload, lastError)
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
