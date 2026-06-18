// Only file permitted to import @anthropic-ai/sdk (enforced by ESLint no-direct-anthropic rule)
import type { LlmProvider } from '../index.js'

export function createClaudeProvider(_config: { apiKey: string }): LlmProvider {
  throw new Error('ClaudeProvider: not implemented — add @anthropic-ai/sdk in P05+')
}
