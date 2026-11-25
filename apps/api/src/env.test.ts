import { describe, expect, it } from 'vitest'
import { loadEnv } from './env.ts'

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5433/db',
  S3_ENDPOINT: 'http://localhost:9100',
}

describe('loadEnv', () => {
  it('applies defaults for port and environment', () => {
    expect(loadEnv(base)).toMatchObject({ NODE_ENV: 'development', API_PORT: 3000 })
  })

  it('reads the port from text', () => {
    expect(loadEnv({ ...base, API_PORT: '4000' }).API_PORT).toBe(4000)
  })

  it('stops on a bad setting, naming it', () => {
    expect(() => loadEnv({ ...base, API_PORT: 'eighty' })).toThrow(/API_PORT is not valid/)
    expect(() => loadEnv({ ...base, NODE_ENV: 'staging' })).toThrow(/NODE_ENV is not valid/)
    expect(() => loadEnv({ S3_ENDPOINT: base.S3_ENDPOINT })).toThrow(/DATABASE_URL is not set/)
  })
})
