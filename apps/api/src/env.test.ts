import { describe, expect, it } from 'vitest'
import { loadEnv } from './env.ts'

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5433/db',
  S3_ENDPOINT: 'http://localhost:9100',
  BETTER_AUTH_SECRET: 'test-only-secret-that-is-at-least-32-characters',
  ALLOW_DEV_GUEST_DATA_KEY: 'true',
}

describe('loadEnv', () => {
  it('applies defaults for port and environment', () => {
    expect(loadEnv(base)).toMatchObject({ NODE_ENV: 'development', API_PORT: 3010 })
  })

  it('reads the port from text', () => {
    expect(loadEnv({ ...base, API_PORT: '4000' }).API_PORT).toBe(4000)
  })

  it('stops on a bad setting, naming it', () => {
    expect(() => loadEnv({ ...base, API_PORT: 'eighty' })).toThrow(/API_PORT is not valid/)
    expect(() => loadEnv({ ...base, NODE_ENV: 'staging' })).toThrow(/NODE_ENV is not valid/)
    expect(() => loadEnv({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL is not set/)
    expect(() => loadEnv({ ...base, BETTER_AUTH_SECRET: 'short' })).toThrow(
      /BETTER_AUTH_SECRET is not valid/,
    )
  })
})

describe('VENTO_ALL_FEATURES', () => {
  it('is off unless set, and can be on in development', () => {
    expect(loadEnv(base).VENTO_ALL_FEATURES).toBe(false)
    expect(loadEnv({ ...base, VENTO_ALL_FEATURES: 'true' }).VENTO_ALL_FEATURES).toBe(true)
  })

  it('can never be on for a production server, even if the build says otherwise', () => {
    expect(() =>
      loadEnv({ ...base, DEPLOY_ENV: 'production', VENTO_ALL_FEATURES: 'true' }),
    ).toThrow()
  })

  it('can never be on in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', VENTO_ALL_FEATURES: 'true' })).toThrow(
      'VENTO_ALL_FEATURES',
    )
  })
})

describe('GUEST_DATA_KEY', () => {
  const key = Buffer.alloc(32, 7).toString('base64')
  const { ALLOW_DEV_GUEST_DATA_KEY: _, ...bare } = base

  it('stops the API when unset and the development key was not asked for', () => {
    expect(() => loadEnv(bare)).toThrow('GUEST_DATA_KEY is not set')
    expect(() => loadEnv({ ...bare, ALLOW_DEV_GUEST_DATA_KEY: 'false' })).toThrow('GUEST_DATA_KEY')
  })

  it('allows the development key only on a local, non-production server', () => {
    expect(() => loadEnv(base)).not.toThrow()
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow('GUEST_DATA_KEY')
    expect(() => loadEnv({ ...base, DEPLOY_ENV: 'staging' })).toThrow('GUEST_DATA_KEY')
    expect(() => loadEnv({ ...base, DEPLOY_ENV: 'production' })).toThrow('GUEST_DATA_KEY')
  })

  it('starts anywhere with a real key', () => {
    expect(
      loadEnv({ ...bare, NODE_ENV: 'production', DEPLOY_ENV: 'production', GUEST_DATA_KEY: key })
        .GUEST_DATA_KEY,
    ).toBe(key)
  })
})
