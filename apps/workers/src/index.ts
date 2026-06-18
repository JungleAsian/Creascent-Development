import 'dotenv/config'

import { createWorker, licenseHeartbeatQueue } from '@docmee/queue'
import { RATE_LIMITS } from '@docmee/config'
import { processConversationJob } from './conversation-processor.worker.js'
import { processTranscriptionJob } from './transcription-processor.worker.js'
import { processAgentJob } from './agent-processor.worker.js'
import { processSchedulingJob } from './scheduling-processor.worker.js'
import { processNotificationJob } from './notification-processor.worker.js'
import { processLicenseHeartbeatJob } from './license-heartbeat.worker.js'
import { processKbEmbedJob } from './kb-embed.worker.js'
import { processFollowUpJob } from './follow-up.worker.js'
import { runTimeoutChecks } from './timeout-monitor.js'

export const conversationWorker = createWorker(
  'whatsapp.inbound',
  processConversationJob,
  RATE_LIMITS.WORKER_CONCURRENCY_CONVERSATION,
)
export const transcriptionWorker = createWorker(
  'transcription',
  processTranscriptionJob,
  RATE_LIMITS.WORKER_CONCURRENCY_TRANSCRIPTION,
)
export const agentWorker = createWorker(
  'agent',
  processAgentJob,
  RATE_LIMITS.WORKER_CONCURRENCY_AGENT,
)
export const schedulingWorker = createWorker(
  'scheduling',
  processSchedulingJob,
  RATE_LIMITS.WORKER_CONCURRENCY_SCHEDULING,
)
export const notificationWorker = createWorker(
  'notification',
  processNotificationJob,
  RATE_LIMITS.WORKER_CONCURRENCY_NOTIFICATION,
)
export const licenseHeartbeatWorker = createWorker(
  'license.heartbeat',
  processLicenseHeartbeatJob,
  1,
)
export const kbEmbedWorker = createWorker('kb-embed', processKbEmbedJob, 3)
export const followUpWorker = createWorker('follow-up', processFollowUpJob, 5)

// Timeout monitor: detects secretary inactivity + stale conversations every 5 min.
const TIMEOUT_CHECK_INTERVAL_MS = 5 * 60 * 1000
export const timeoutMonitor = setInterval(() => {
  void runTimeoutChecks()
}, TIMEOUT_CHECK_INTERVAL_MS)
// Don't keep the process alive solely for the monitor.
if (typeof timeoutMonitor.unref === 'function') timeoutMonitor.unref()

// License heartbeat: enqueue a full-audit tick every 30 min. The worker checks
// each active clinic's license and fires LICENSE_EXPIRING / LICENSE_EXPIRED
// alerts — it never deactivates a clinic (licensing must not interrupt a live clinic).
const LICENSE_HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000
export const licenseHeartbeatScheduler = setInterval(() => {
  void licenseHeartbeatQueue
    .add('audit', {})
    .catch((err) => console.error('[license-heartbeat] failed to enqueue tick:', err))
}, LICENSE_HEARTBEAT_INTERVAL_MS)
if (typeof licenseHeartbeatScheduler.unref === 'function') licenseHeartbeatScheduler.unref()

console.log('[workers] all 8 workers registered and listening')
