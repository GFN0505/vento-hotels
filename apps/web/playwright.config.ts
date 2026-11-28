import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

// Browser tests run their own API and web app on separate ports, against the test database, so they
// never touch your development data or a running `pnpm dev`.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url))
} catch {
  // CI provides the variables directly.
}

const API_PORT = 3100
const WEB_PORT = 5174
const WEB_URL = `http://localhost:${WEB_PORT}`
export const OUTBOX = fileURLToPath(new URL('./.data/e2e-outbox', import.meta.url))
// Empty it once per run. Workers load this file too, and clearing it there would delete emails
// other tests are still waiting for.
if (!process.env.TEST_WORKER_INDEX) rmSync(OUTBOX, { recursive: true, force: true })

const testDatabase = process.env.TEST_DATABASE_URL
if (!testDatabase) throw new Error('TEST_DATABASE_URL is not set. Copy .env.example to .env.')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: WEB_URL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node ../api/src/server.ts',
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        NODE_ENV: 'test',
        API_PORT: String(API_PORT),
        DATABASE_URL: testDatabase,
        S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://localhost:9100',
        BETTER_AUTH_SECRET: 'e2e-only-secret-that-is-at-least-32-characters',
        BETTER_AUTH_URL: WEB_URL,
        WEB_ORIGIN: WEB_URL,
        EMAIL_OUTBOX_DIR: OUTBOX,
        // Browser tests cover unreleased modules too (decision 0021).
        VENTO_ALL_FEATURES: 'true',
        // The fixed development key for guest ID numbers, shared with the seed (crypto.ts).
        ALLOW_DEV_GUEST_DATA_KEY: 'true',
      },
    },
    {
      // The production build, as people get it: the service worker and offline shell only exist
      // there (decision 0009). Built into its own folder so it never clashes with dist/.
      command:
        'pnpm exec vite build --outDir .data/e2e-dist --emptyOutDir --logLevel warn && pnpm exec vite preview --outDir .data/e2e-dist',
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        // .env sets NODE_ENV=development for the API; the web build must be a production one.
        NODE_ENV: 'production',
        WEB_PORT: String(WEB_PORT),
        VITE_API_PROXY: `http://localhost:${API_PORT}`,
      },
    },
  ],
})
