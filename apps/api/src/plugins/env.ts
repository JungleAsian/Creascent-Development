import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(3001),
  APP_URL: z.string().default('http://localhost:3000'),
  SUPABASE_URL: z.string().default('http://localhost:54321'),
  SUPABASE_ANON_KEY: z.string().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  LLM_STUB: z.coerce.boolean().default(true),
  WEBHOOK_TARGET: z.string().default('http://localhost:3001/webhook/whatsapp'),
})

export type Env = z.infer<typeof schema>

export function parseEnv(): Env {
  return schema.parse(process.env)
}
