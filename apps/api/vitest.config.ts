import { defineConfig } from 'vitest/config'

// Load the repo's .env (if present) so local integration tests find the services from `pnpm db:up`.
// In CI the same variables come from the workflow instead.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url))
} catch {
  // No .env: integration tests that need services are skipped.
}

export default defineConfig({
  test: {},
})
