// Only file permitted to import openai (enforced by ESLint no-direct-openai rule)
import type { LlmProvider } from '../index.js'

export function createOpenAiProvider(_config: { apiKey: string }): LlmProvider {
  throw new Error('OpenAiProvider: not implemented — add openai sdk in P05+')
}
