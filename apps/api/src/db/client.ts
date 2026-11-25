import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema/index.ts'

export type Database = ReturnType<typeof createDatabase>['db']

// One pool per process. Close it on shutdown so in-flight queries finish.
export function createDatabase(databaseUrl: string, options: { max?: number } = {}) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: options.max ?? 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30_000,
  })
  const db = drizzle({ client: pool, schema, casing: 'snake_case' })
  return { db, pool, close: () => pool.end() }
}
