// Only file permitted to import deepseek (enforced by ESLint no-direct-deepseek rule)
import type { LlmProvider } from '../index.js'

export function createDeepSeekProvider(_config: { apiKey: string }): LlmProvider {
  throw new Error('DeepSeekProvider: not implemented — add deepseek sdk in P05+')
}
