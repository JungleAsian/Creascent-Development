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

export { createDeepgramProvider } from './transcription/deepgram-provider.js'

export function createWhatsAppAdapter(_config: { accessToken: string }): ChannelAdapter {
  throw new Error('WhatsAppAdapter: not implemented — wire Meta webhook in P04+')
}
