// Consumes: scheduling queue. Full impl (Google Calendar) in P06.
import type { Job } from '@docmee/queue'

export async function processSchedulingJob(_job: Job): Promise<void> {
  // Google Calendar booking/reschedule/cancel. Wired in P06.
}
