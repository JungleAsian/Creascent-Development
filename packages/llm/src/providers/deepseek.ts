// Only file permitted to call the DeepSeek API (via openai-compatible client).
// Intent classification only. Returns exactly one of the 10 locked intents.
import OpenAI from 'openai'

export type Intent =
  | 'greeting'
  | 'booking_request'
  | 'reschedule_request'
  | 'cancel_request'
  | 'appointment_status_check'
  | 'general_question'
  | 'emergency'
  | 'human_handoff_request'
  | 'stop_optout'
  | 'out_of_scope'

const INTENTS: Intent[] = [
  'greeting',
  'booking_request',
  'reschedule_request',
  'cancel_request',
  'appointment_status_check',
  'general_question',
  'emergency',
  'human_handoff_request',
  'stop_optout',
  'out_of_scope',
]

export async function classifyIntent(message: string): Promise<Intent> {
  if (process.env['LLM_STUB'] === 'true') return 'general_question'
  const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env['DEEPSEEK_API_KEY'],
  })
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content:
          `You are an intent classifier for a medical clinic's patient messaging assistant. ` +
          `Classify the patient message into exactly one of these intents: ${INTENTS.join(', ')}. ` +
          `Reply with only the intent name, nothing else.`,
      },
      { role: 'user', content: message },
    ],
    max_tokens: 20,
    temperature: 0,
  })
  const raw = response.choices[0]?.message.content?.trim().toLowerCase() ?? ''
  // If the response is not a valid intent, fall back to out_of_scope.
  return (INTENTS as string[]).includes(raw) ? (raw as Intent) : 'out_of_scope'
}
