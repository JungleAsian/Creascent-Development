// Only file permitted to import bullmq (enforced by ESLint no-direct-bullmq rule)
import type { QueueClient } from '../index.js'

export function createQueueClient(_config: { url: string }): QueueClient {
  throw new Error('QueueClient: not implemented — add bullmq in P03+')
}
