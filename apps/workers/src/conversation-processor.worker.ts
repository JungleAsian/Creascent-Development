// Consumes: whatsapp.inbound queue.
// Routes inbound WhatsApp messages to transcription (audio) or directly to the agent.
import { z } from 'zod'
import { transcriptionQueue, agentQueue, type Job } from '@docmee/queue'

export const InboundMessageSchema = z.object({
  clinicId: z.string().uuid(),
  patientWaId: z.string(),
  messageType: z.enum(['text', 'audio', 'image', 'document']),
  content: z.string().optional(), // for text messages
  mediaId: z.string().optional(), // for audio/image/document
  mimeType: z.string().optional(),
  waMessageId: z.string(),
  phoneNumberId: z.string(),
  waAccessToken: z.string(),
  timestamp: z.number(),
})

export type InboundMessage = z.infer<typeof InboundMessageSchema>

export async function processConversationJob(job: Job): Promise<void> {
  const msg = InboundMessageSchema.parse(job.data)

  if (msg.messageType === 'audio') {
    // Transcribe first; the transcription worker re-enqueues to the agent.
    await transcriptionQueue.add('transcribe', {
      conversationId: msg.waMessageId, // temp — real ID assigned after DB lookup
      messageId: msg.waMessageId,
      clinicId: msg.clinicId,
      mediaId: msg.mediaId,
      mimeType: msg.mimeType,
      waAccessToken: msg.waAccessToken,
    })
  } else {
    // Text/image/document → straight to the agent for intent classification.
    await agentQueue.add('process', {
      clinicId: msg.clinicId,
      patientWaId: msg.patientWaId,
      message: msg.content ?? '',
      waMessageId: msg.waMessageId,
    })
  }
}
