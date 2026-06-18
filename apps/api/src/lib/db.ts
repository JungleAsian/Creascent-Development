// Shared DB access for routes. Each request opens a short-lived service client
// and closes it in finally (matches the P04–P07 route convention).
import { createServiceDbClient } from '@docmee/db'
import type { Sql } from '@docmee/db'

export function dbClient(): Sql {
  return createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })
}

/** Run `fn` with a DB client, guaranteeing the connection is closed afterwards. */
export async function withDb<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = dbClient()
  try {
    return await fn(sql)
  } finally {
    await sql.end()
  }
}
