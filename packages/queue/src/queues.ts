import { createQueue } from './providers/bullmq.js'

export const whatsappInboundQueue = createQueue('whatsapp.inbound')
// Delivery-status receipts (sent/delivered/read/failed) from Meta's `statuses`
// webhook (Req 3). Separate from inbound messages so a status backlog never
// blocks patient messages and vice-versa.
export const whatsappStatusQueue = createQueue('whatsapp.status')
export const transcriptionQueue = createQueue('transcription')
export const agentQueue = createQueue('agent')
export const schedulingQueue = createQueue('scheduling')
export const notificationQueue = createQueue('notification')
export const licenseHeartbeatQueue = createQueue('license.heartbeat')
export const kbEmbedQueue = createQueue('kb-embed')
export const followUpQueue = createQueue('follow-up')
// P18 — Phase 3 scheduled jobs.
export const reportsQueue = createQueue('reports')
export const sheetsSyncQueue = createQueue('sheets-sync')
export const reviewRequestQueue = createQueue('review-request')
