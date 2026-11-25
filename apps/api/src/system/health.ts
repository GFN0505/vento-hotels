import type { Health } from '@vento/shared'
import { checkPostgres, checkStorage } from '../infra/checks.ts'

export type HealthCheck = () => Promise<Health>

export function healthCheck(config: { databaseUrl: string; s3Endpoint: string }): HealthCheck {
  return async () => {
    const [database, storage] = await Promise.all([
      checkPostgres(config.databaseUrl),
      checkStorage(config.s3Endpoint),
    ])
    return {
      status: database.ok && storage.ok ? 'ok' : 'degraded',
      checks: { database, storage },
      checkedAt: new Date().toISOString(),
    }
  }
}
