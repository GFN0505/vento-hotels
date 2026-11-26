// The API's settings, validated once at start. A bad or missing setting stops the server with the
// setting's name (never its value) instead of failing later on the first request.
import { z } from 'zod'
import { infraEnvSchema, MissingSettingError } from './infra/config.ts'

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
