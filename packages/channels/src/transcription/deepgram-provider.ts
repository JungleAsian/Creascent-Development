// Only file permitted to fetch Deepgram API (enforced by ESLint no-direct-deepgram rule)
import type { TranscriptionProvider } from '../index.js'

export function createDeepgramProvider(_config: { apiKey: string }): TranscriptionProvider {
  throw new Error('DeepgramProvider: not implemented — add Deepgram API key in P05+')
}
