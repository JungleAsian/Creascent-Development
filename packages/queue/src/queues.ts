import { createQueue } from './providers/bullmq.js'

export const whatsappInboundQueue = createQueue('whatsapp.inbound')
export const transcriptionQueue = createQueue('transcription')
export const agentQueue = createQueue('agent')
export const schedulingQueue = createQueue('scheduling')
export const notificationQueue = createQueue('notification')
export const licenseHeartbeatQueue = createQueue('license.heartbeat')
export const kbEmbedQueue = createQueue('kb-embed')
export const followUpQueue = createQueue('follow-up')
