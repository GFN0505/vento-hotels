import { describe, expect, it } from 'vitest'
import { MissingSettingError, readInfraConfig } from './config.ts'

describe('readInfraConfig', () => {
  it('reads the database URL and storage endpoint', () => {
    const config = readInfraConfig({
      DATABASE_URL: 'postgres://u:p@localhost:5433/db',
      S3_ENDPOINT: 'http://localhost:9100/',
    })
    expect(config).toEqual({
      databaseUrl: 'postgres://u:p@localhost:5433/db',
      s3Endpoint: 'http://localhost:9100',
    })
  })

  it('names the missing setting and how to fix it', () => {
    expect(() => readInfraConfig({ S3_ENDPOINT: 'http://localhost:9100' })).toThrow(
      MissingSettingError,
    )
    expect(() => readInfraConfig({ DATABASE_URL: ' ', S3_ENDPOINT: 'x' })).toThrow(
      /DATABASE_URL is not set/,
    )
  })
})
