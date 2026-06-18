// Consumes: license.heartbeat queue. Full impl in P10.
import type { Job } from '@docmee/queue'

export async function processLicenseHeartbeatJob(_job: Job): Promise<void> {
  // License seat audit / heartbeat. Wired in P10.
}
