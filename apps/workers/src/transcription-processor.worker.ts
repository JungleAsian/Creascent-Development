// Consumes: transcription queue. Full impl (Whisper) in P05+.
import type { Job } from '@docmee/queue'

export async function processTranscriptionJob(_job: Job): Promise<void> {
  // Transcribe audio → re-enqueue to agent queue. Wired in P05+.
}
