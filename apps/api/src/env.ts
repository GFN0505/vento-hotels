// The API's settings, validated once at start. A bad or missing setting stops the server with the
// setting's name (never its value) instead of failing later on the first request.
import { z } from 'zod'
import { infraEnvSchema, MissingSettingError } from './infra/config.ts'
import type { S3Settings } from './providers/storage.ts'

const envSchema = infraEnvSchema.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Which server this is. Staging runs production builds too, but may load the demo seed.
  DEPLOY_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3010),
  // Signs sessions and tokens. At least 32 random characters; generate with `openssl rand -base64 32`.
  BETTER_AUTH_SECRET: z.string().min(32),
  // Where the API is reached (used in email links) and the web app's origin (trusted for cookies).
  BETTER_AUTH_URL: z.url().default('http://localhost:5180'),
  WEB_ORIGIN: z.url().default('http://localhost:5180'),
  // Local development and browser tests only: save emails as files here instead of printing them.
  EMAIL_OUTBOX_DIR: z.string().optional(),
  // Development and browser tests only: every module on, released or not (decision 0021).
  // Background jobs (pg-boss) in this process. Off for processes that only serve requests.
  JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  // Object storage credentials (RustFS locally, Cloudflare R2 in production; decision 0016). Without
  // them the API runs, but uploads (hotel logos) answer "not set up". R2 uses region "auto".
  S3_REGION: z.string().trim().min(1).default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
  S3_BUCKET: z.string().trim().min(3).optional(),
  // Error tracking (Sentry). Unset means off; logs still record every error.
  SENTRY_DSN: z.url().optional(),
  // debug, info (default), warn or error.
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),
  VENTO_ALL_FEATURES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const setting = String(result.error.issues[0]?.path[0] ?? 'A setting')
    const missing = source[setting] === undefined || source[setting]?.trim() === ''
    throw new MissingSettingError(setting, missing ? 'is not set' : 'is not valid')
  }
  // Unreleased modules must never reach customers by a stray setting.
  if (
    (result.data.NODE_ENV === 'production' || result.data.DEPLOY_ENV === 'production') &&
    result.data.VENTO_ALL_FEATURES
  ) {
    throw new MissingSettingError('VENTO_ALL_FEATURES', 'must be off in production')
  }
  return result.data
}

// Storage settings when all of them are set, so a half-configured server fails loudly at start.
export function storageSettings(env: Env): S3Settings | undefined {
  const {
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
    S3_BUCKET: bucket,
  } = env
  const given = [accessKeyId, secretAccessKey, bucket].filter(Boolean).length
  if (given === 0) return undefined
  if (!accessKeyId || !secretAccessKey || !bucket) {
    const missing = !accessKeyId
      ? 'S3_ACCESS_KEY_ID'
      : !secretAccessKey
        ? 'S3_SECRET_ACCESS_KEY'
        : 'S3_BUCKET'
    throw new MissingSettingError(missing, 'is not set (the other storage settings are)')
  }
  return { endpoint: env.S3_ENDPOINT, region: env.S3_REGION, accessKeyId, secretAccessKey, bucket }
}
