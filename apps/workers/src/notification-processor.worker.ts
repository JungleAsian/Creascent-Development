// Consumes: notification queue. Full impl in P07.
import type { Job } from '@docmee/queue'

export async function processNotificationJob(_job: Job): Promise<void> {
  // WhatsApp/email notification + human-handoff dispatch. Wired in P07.
}
