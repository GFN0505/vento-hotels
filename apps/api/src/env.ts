// The API's settings, validated once at start. A bad or missing setting stops the server with the
// setting's name (never its value) instead of failing later on the first request.
import { z } from 'zod'
import { infraEnvSchema, MissingSettingError } from './infra/config.ts'

const envSchema = infraEnvSchema.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  // Signs sessions and tokens. At least 32 random characters; generate with `openssl rand -base64 32`.
  BETTER_AUTH_SECRET: z.string().min(32),
  // Where the API is reached (used in email links) and the web app's origin (trusted for cookies).
  BETTER_AUTH_URL: z.url().default('http://localhost:3000'),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const setting = String(result.error.issues[0]?.path[0] ?? 'A setting')
    const missing = source[setting] === undefined || source[setting]?.trim() === ''
    throw new MissingSettingError(setting, missing ? 'is not set' : 'is not valid')
  }
  return result.data
}
