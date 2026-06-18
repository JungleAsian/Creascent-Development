export type ChannelType = 'whatsapp' | 'messenger' | 'instagram'

export interface InboundMessage {
  id: string
  channel: ChannelType
  from: string
  to: string
  content: string
  audioUrl?: string
  timestamp: string
}

export interface OutboundMessage {
  to: string
  content: string
  channel: ChannelType
}

export interface ChannelAdapter {
  send(message: OutboundMessage): Promise<void>
  parseInbound(payload: unknown): InboundMessage
}

export interface TranscriptionProvider {
  transcribe(audioUrl: string): Promise<string>
}

export { sendWhatsAppText } from './whatsapp-sender.js'
export { downloadMedia, type DownloadedMedia } from './media-downloader.js'
export { createDeepgramProvider } from './transcription/deepgram-provider.js'

import { sendWhatsAppText } from './whatsapp-sender.js'

export interface WhatsAppAdapterConfig {
  phoneNumberId: string
  accessToken: string
}

/**
 * Outbound WhatsApp adapter. Inbound parsing lives in the webhook route
 * (apps/api), which validates the raw Meta payload before enqueueing.
 */
export function createWhatsAppAdapter(config: WhatsAppAdapterConfig): ChannelAdapter {
  return {
    async send(message: OutboundMessage): Promise<void> {
      await sendWhatsAppText(config.phoneNumberId, config.accessToken, message.to, message.content)
    },
    parseInbound(): InboundMessage {
      throw new Error('parseInbound: inbound WhatsApp payloads are parsed in the webhook route')
    },
  }
}
