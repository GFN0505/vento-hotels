import { describe, expect, it } from 'vitest'
import { checkPostgres, checkStorage } from './checks.ts'

// These talk to the real services from `pnpm db:up` (and the service containers in CI).
// Without DATABASE_URL / S3_ENDPOINT they are skipped, and the skip shows in the test output.
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const s3Endpoint = process.env.S3_ENDPOINT

describe.skipIf(!databaseUrl)('checkPostgres against the local database', () => {
  it('connects and reports Postgres 18', async () => {
    const result = await checkPostgres(databaseUrl ?? '')
    expect(result).toMatchObject({ ok: true })
    if (result.ok) expect(result.detail).toMatch(/^Postgres 18\./)
  })
})

describe.skipIf(!s3Endpoint)('checkStorage against the local storage', () => {
  it('finds the storage healthy', async () => {
    expect(await checkStorage(s3Endpoint ?? '')).toMatchObject({ ok: true })
  })
})

describe('checks when a service is down', () => {
  it('reports an unreachable database instead of throwing', async () => {
    const result = await checkPostgres('postgres://nobody:nothing@127.0.0.1:1/none')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).not.toBe('')
  })

  it('reports unreachable storage instead of throwing', async () => {
    const result = await checkStorage('http://127.0.0.1:1')
    expect(result.ok).toBe(false)
  })
})
