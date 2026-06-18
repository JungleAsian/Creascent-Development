export interface QueueJob<T = unknown> {
  id: string
  type: string
  data: T
  attempts: number
  createdAt: string
}

export interface QueueClient {
  enqueue<T>(type: string, data: T): Promise<string>
  process<T>(type: string, handler: (job: QueueJob<T>) => Promise<void>): void
}

export { createQueueClient } from './providers/bullmq.js'
