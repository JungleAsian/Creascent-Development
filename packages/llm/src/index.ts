export type LlmRole = 'user' | 'assistant' | 'system'

export interface LlmMessage {
  role: LlmRole
  content: string
}

export interface LlmResponse {
  content: string
  model: string
  inputTokens: number
  outputTokens: number
}

export interface LlmProvider {
  complete(messages: LlmMessage[], options?: LlmOptions): Promise<LlmResponse>
}

export interface LlmOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
}

export { createClaudeProvider } from './providers/claude.js'
export { createOpenAiProvider } from './providers/openai.js'
export { createDeepSeekProvider } from './providers/deepseek.js'

export function createStubProvider(): LlmProvider {
  return {
    async complete(_messages) {
      return {
        content: '[LLM_STUB] Response placeholder — set LLM_STUB=false to use real provider',
        model: 'stub',
        inputTokens: 0,
        outputTokens: 0,
      }
    },
  }
}
