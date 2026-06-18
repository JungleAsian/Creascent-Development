// Only file permitted to import @anthropic-ai/sdk
import Anthropic from '@anthropic-ai/sdk'

export async function claudeComplete(
  system: string,
  userMessage: string,
  maxTokens = 1024,
): Promise<string> {
  if (process.env['LLM_STUB'] === 'true') return 'STUB_RESPONSE'
  const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] })
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userMessage }],
  })
  const block = msg.content[0]
  return block?.type === 'text' ? block.text : ''
}
