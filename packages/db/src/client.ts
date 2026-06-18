// Only file permitted to import @supabase/supabase-js (enforced by ESLint no-direct-supabase rule)

export interface DbClient {
  readonly url: string
}

export function createDbClient(_config: { url: string; key: string }): DbClient {
  throw new Error('DbClient: not implemented — add @supabase/supabase-js in P02+')
}
