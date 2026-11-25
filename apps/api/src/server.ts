// Starts the API: `pnpm dev` (watch mode) or `pnpm --filter @vento/api start`.
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createAuth } from './auth/auth.ts'
import { createDatabase } from './db/client.ts'
import { loadEnv } from './env.ts'
import { ConsoleEmailProvider } from './providers/email.ts'
import { healthCheck } from './system/health.ts'

const env = loadEnv()
const database = createDatabase(env.DATABASE_URL)
const auth = createAuth({
  db: database.db,
  settings: {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    webOrigin: env.WEB_ORIGIN,
  },
  email: new ConsoleEmailProvider(),
})
const app = createApp({
  db: database.db,
  auth,
  checkHealth: healthCheck({ databaseUrl: env.DATABASE_URL, s3Endpoint: env.S3_ENDPOINT }),
})

const server = serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`✓ Vento Hotels API on http://localhost:${info.port} (health: /health)`)
})

// Finish in-flight requests on Ctrl+C or a platform stop, close the database pool, then exit.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => {
      database.close().finally(() => process.exit(0))
    })
  })
}
