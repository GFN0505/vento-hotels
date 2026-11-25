// Reads the infrastructure settings documented in .env.example.
// A full validated env schema (zod) arrives with the shared basics in brick 3.

export type InfraConfig = {
  databaseUrl: string
  s3Endpoint: string
}

export class MissingSettingError extends Error {
  readonly setting: string

  constructor(setting: string) {
    super(`${setting} is not set. Copy .env.example to .env, then run pnpm db:up.`)
    this.setting = setting
  }
}

type Env = Record<string, string | undefined>

function required(env: Env, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new MissingSettingError(name)
  return value
}

export function readInfraConfig(env: Env = process.env): InfraConfig {
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    s3Endpoint: required(env, 'S3_ENDPOINT').replace(/\/+$/, ''),
  }
}
