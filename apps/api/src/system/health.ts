import type { Health } from '@vento/shared'
import { checkPostgres, checkStorage } from '../infra/checks.ts'

export type HealthCheck = () => Promise<Health>

export function healthCheck(config: {
  databaseUrl: string
  s3Endpoint: string
  jobs?: { healthy: () => { ok: true; detail: string } | { ok: false; error: string } } | undefined
}): HealthCheck {
  return async () => {
    const [database, storage] = await Promise.all([
      checkPostgres(config.databaseUrl),
      checkStorage(config.s3Endpoint),
    ])
    const jobs = config.jobs?.healthy()
    return {
      status: database.ok && storage.ok && (jobs?.ok ?? true) ? 'ok' : 'degraded',
      checks: { database, storage, ...(jobs ? { jobs } : {}) },
      checkedAt: new Date().toISOString(),
    }
  }
}
