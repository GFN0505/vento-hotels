// Starts the API: `pnpm dev` (watch mode) or `pnpm --filter @vento/api start`.
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createAuth } from './auth/auth.ts'
import { createDatabase } from './db/client.ts'
import { loadEnv, privateStorageSettings, storageSettings } from './env.ts'
import { type Jobs, QueuedEmailProvider, startJobs } from './jobs/queue.ts'
import { flushErrorTracking, reportError, startErrorTracking } from './observability/errors.ts'
import { logger } from './observability/log.ts'
import { ConsoleEmailProvider, FileEmailProvider, NoEmailProvider } from './providers/email.ts'
import { S3StorageProvider } from './providers/storage.ts'
import { RateLimiter } from './rate-limit.ts'
import { healthCheck } from './system/health.ts'

const env = loadEnv()
if (env.LOG_LEVEL) logger.level = env.LOG_LEVEL
startErrorTracking({ dsn: env.SENTRY_DSN, environment: env.DEPLOY_ENV })
process.on('unhandledRejection', (error) => reportError(error, 'unhandled'))

const database = createDatabase(env.DATABASE_URL)
const s3 = storageSettings(env)
const storage = s3 ? new S3StorageProvider(s3) : undefined
const privateS3 = privateStorageSettings(env)
const privateStorage = privateS3 ? new S3StorageProvider(privateS3) : undefined
if (!storage) logger.warn('No storage settings (S3_*): uploads are switched off')
// Locally the bucket is created on first start, with CORS for the web app on any localhost port.
if (storage && env.DEPLOY_ENV === 'local') {
  await storage.prepareLocalBucket().catch((error: unknown) => reportError(error, 'storage setup'))
  await privateStorage
    ?.prepareLocalBucket({ cors: false })
    .catch((error: unknown) => reportError(error, 'private storage setup'))
}
const deliver =
  env.DEPLOY_ENV !== 'local'
    ? new NoEmailProvider()
    : env.EMAIL_OUTBOX_DIR && env.NODE_ENV !== 'production'
      ? new FileEmailProvider(env.EMAIL_OUTBOX_DIR)
      : new ConsoleEmailProvider()
// With jobs on, email goes through the queue and is retried if the provider fails.
const jobs: Jobs | undefined = env.JOBS_ENABLED
  ? await startJobs({
      databaseUrl: env.DATABASE_URL,
      email: deliver,
      db: database.db,
      storage,
      privateStorage,
    })
  : undefined
const email = jobs ? new QueuedEmailProvider(jobs.queue) : deliver
const limiter = new RateLimiter(env.NODE_ENV !== 'test')
const auth = createAuth({
  db: database.db,
  settings: {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    webOrigin: env.WEB_ORIGIN,
    rateLimit: env.NODE_ENV !== 'test',
  },
  email,
  limiter,
})
const app = createApp({
  db: database.db,
  auth,
  email,
  storage,
  privateStorage,
  cardSecret: env.BETTER_AUTH_SECRET,
  webOrigin: env.WEB_ORIGIN,
  limiter,
  allFeatures: env.VENTO_ALL_FEATURES,
  checkHealth: healthCheck({
    databaseUrl: env.DATABASE_URL,
    s3Endpoint: env.S3_ENDPOINT,
    jobs,
  }),
})

const server = serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  logger.info(
    { port: info.port, jobs: Boolean(jobs) },
    `Vento Hotels API on http://localhost:${info.port} (health: /health)`,
  )
})

// Finish in-flight requests and jobs on Ctrl+C or a platform stop, then close the database pool.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => {
      Promise.allSettled([jobs?.stop(), flushErrorTracking()])
        .then(() => database.close())
        .finally(() => process.exit(0))
    })
  })
}
