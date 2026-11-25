// Reads and validates the infrastructure settings documented in .env.example.
import { z } from 'zod'

const infraEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .trim()
    .min(1)
    .refine((v) => /^postgres(ql)?:\/\//.test(v), 'must start with postgres://'),
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }).transform((v) => v.replace(/\/+$/, '')),
})

export type InfraConfig = {
  databaseUrl: string
  s3Endpoint: string
}

export class MissingSettingError extends Error {
  readonly setting: string

  constructor(setting: string, problem = 'is not set') {
    super(`${setting} ${problem}. Copy .env.example to .env, then run pnpm db:up.`)
    this.setting = setting
  }
}

type Env = Record<string, string | undefined>

export function readInfraConfig(env: Env = process.env): InfraConfig {
  const result = infraEnvSchema.safeParse(env)
  if (!result.success) {
    // Report the first problem by setting name only; never echo a value (it may hold a password).
    const issue = result.error.issues[0]
    const setting = String(issue?.path[0] ?? 'A setting')
    const missing = env[setting] === undefined || env[setting]?.trim() === ''
    throw new MissingSettingError(setting, missing ? 'is not set' : 'is not valid')
  }
  return { databaseUrl: result.data.DATABASE_URL, s3Endpoint: result.data.S3_ENDPOINT }
}
