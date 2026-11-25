// Starts the API: `pnpm dev` (watch mode) or `pnpm --filter @vento/api start`.
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { loadEnv } from './env.ts'
import { healthCheck } from './system/health.ts'

const env = loadEnv()
const app = createApp({
  checkHealth: healthCheck({ databaseUrl: env.DATABASE_URL, s3Endpoint: env.S3_ENDPOINT }),
})

const server = serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`✓ Vento Hotels API on http://localhost:${info.port} (health: /health)`)
})

// Finish in-flight requests on Ctrl+C or a platform stop, then exit.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0))
  })
}
