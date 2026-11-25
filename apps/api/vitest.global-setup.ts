// Before any test runs: bring the test database up to the latest migration, so database tests always
// run against the real schema. Skipped when no test database is configured.
import { runMigrations } from './src/db/migrate.ts'

export async function setup() {
  const url = process.env.TEST_DATABASE_URL
  if (url) await runMigrations(url)
}
