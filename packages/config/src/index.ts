import { z } from 'zod'

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LLM_STUB: z.coerce.boolean().default(true),
})

export type BaseConfig = z.infer<typeof baseSchema>

export function parseBaseConfig(): BaseConfig {
  return baseSchema.parse(process.env)
}

export function isProduction(): boolean {
  return process.env['NODE_ENV'] === 'production'
}

export function isDevelopment(): boolean {
  return process.env['NODE_ENV'] === 'development'
}

export function isLlmStub(): boolean {
  return process.env['LLM_STUB'] !== 'false'
}
