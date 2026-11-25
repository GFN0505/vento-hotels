// Applies committed migrations from ./drizzle. Runs as a release step (`pnpm db:migrate`), never
// automatically when the API starts, so a bad migration can't take the API down with it.
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDatabase } from './client.ts'

export const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

export async function runMigrations(databaseUrl: string): Promise<void> {
  const { db, close } = createDatabase(databaseUrl, { max: 1 })
  try {
    await migrate(db, { migrationsFolder })
  } finally {
    await close()
  }
}

// When run directly: migrate DATABASE_URL (or TEST_DATABASE_URL with --test).
if (import.meta.main) {
  const useTest = process.argv.includes('--test')
  const name = useTest ? 'TEST_DATABASE_URL' : 'DATABASE_URL'
  const url = process.env[name]
  if (!url) {
    console.error(`✗ ${name} is not set. Copy .env.example to .env, then run pnpm db:up.`)
    process.exitCode = 1
  } else {
    await runMigrations(url)
    console.log(`✓ Migrations applied (${useTest ? 'test database' : 'database'})`)
  }
}
