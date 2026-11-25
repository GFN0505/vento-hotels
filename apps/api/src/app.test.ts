import { createRouterClient } from '@orpc/server'
import { healthSchema } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import type { Auth } from './auth/auth.ts'
import type { Database } from './db/client.ts'
import { router } from './router.ts'
import type { HealthCheck } from './system/health.ts'

// /health and system.health don't touch the database or auth, so these tests use placeholders.
const unused = {} as Database & Auth
const deps = (checkHealth: HealthCheck) => ({ checkHealth, db: unused, auth: unused })

const healthy: HealthCheck = async () => ({
  status: 'ok',
  checks: {
    database: { ok: true, detail: 'Postgres 18.7' },
    storage: { ok: true, detail: 'Storage healthy' },
  },
  checkedAt: '2026-11-25T08:00:00.000Z',
})

const databaseDown: HealthCheck = async () => ({
  status: 'degraded',
  checks: {
    database: { ok: false, error: 'connect ECONNREFUSED' },
    storage: { ok: true, detail: 'Storage healthy' },
  },
  checkedAt: '2026-11-25T08:00:00.000Z',
})

describe('GET /health', () => {
  it('answers 200 with the checks when everything is reachable', async () => {
    const response = await createApp(deps(healthy)).request('/health')
    expect(response.status).toBe(200)
    expect(healthSchema.parse(await response.json()).status).toBe('ok')
  })

  it('answers 503 when a service is down, so monitors and deploys can react', async () => {
    const response = await createApp(deps(databaseDown)).request('/health')
    expect(response.status).toBe(503)
    const body = healthSchema.parse(await response.json())
    expect(body.checks.database.ok).toBe(false)
  })
})

describe('/rpc', () => {
  it('serves system.health through the typed router', async () => {
    const client = createRouterClient(router, {
      context: { ...deps(healthy), headers: new Headers() },
    })
    expect((await client.system.health()).status).toBe('ok')
  })

  it('serves system.health over HTTP', async () => {
    const response = await createApp(deps(healthy)).request('/rpc/system/health', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(response.status).toBe(200)
  })

  it('answers 404 for unknown routes', async () => {
    const response = await createApp(deps(healthy)).request('/rpc/nothing/here', {
      method: 'POST',
    })
    expect(response.status).toBe(404)
  })
})
