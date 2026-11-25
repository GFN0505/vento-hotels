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
    expect(() =>
      readInfraConfig({ DATABASE_URL: ' ', S3_ENDPOINT: 'http://localhost:9100' }),
    ).toThrow(/DATABASE_URL is not set/)
  })

  it('rejects malformed settings without echoing their values', () => {
    const attempt = () =>
      readInfraConfig({
        DATABASE_URL: 'mysql://user:s3cret@host/db',
        S3_ENDPOINT: 'http://localhost:9100',
      })
    expect(attempt).toThrow(/DATABASE_URL is not valid/)
    expect(attempt).not.toThrow(/s3cret/)
    expect(() =>
      readInfraConfig({ DATABASE_URL: 'postgres://u:p@h/db', S3_ENDPOINT: 'ftp://x' }),
    ).toThrow(/S3_ENDPOINT is not valid/)
  })
})
