// Before any test runs: rebuild the test database from scratch and apply every migration, so tests
// always start from the real schema with no leftovers. Only ever touches a database whose name ends
// in `_test`, so a misconfigured URL can never wipe development data.
import pg from 'pg'
import { runMigrations } from './src/db/migrate.ts'

export async function setup() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) return

  const name = new URL(url).pathname.slice(1)
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to reset "${name}": the test database name must end with _test`)
  }

  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await client.query('drop schema if exists drizzle cascade')
    await client.query('drop schema public cascade')
    await client.query('create schema public')
  } finally {
    await client.end()
  }
  await runMigrations(url)
}
