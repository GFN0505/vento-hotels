import { defineConfig } from 'drizzle-kit'

// Load the repo's .env for local commands (db:generate, db:migrate, db:studio). In CI and production
// the variables come from the environment instead.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url))
} catch {
  // No .env file: rely on the environment.
}

const url = process.env.DATABASE_URL
if (!url)
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env, then run pnpm db:up.')

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
