// The S3 storage provider against real S3-compatible storage: RustFS locally and in CI. Skipped
// when the S3 settings aren't there. Uses its own bucket, so it never touches development files.
import { newId } from '@vento/shared'
import { beforeAll, describe, expect, it } from 'vitest'
import { solidPng } from '../storage/png.ts'
import { S3StorageProvider } from './storage.ts'

const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } = process.env
const configured = Boolean(S3_ENDPOINT && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY)

describe.skipIf(!configured)('S3 storage', () => {
  const storage = new S3StorageProvider({
    endpoint: S3_ENDPOINT ?? '',
    region: S3_REGION ?? 'us-east-1',
    accessKeyId: S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: S3_SECRET_ACCESS_KEY ?? '',
    bucket: 'vento-hotels-test',
  })
  const png = solidPng(240, 240, [10, 20, 30])

  beforeAll(async () => {
    await storage.prepareLocalBucket()
  })

  it('accepts an upload of exactly the signed type and size, and reads it back', async () => {
    const key = `tests/${newId()}.png`
    const signed = await storage.signedUpload(key, {
      contentType: 'image/png',
      size: png.length,
      expiresInSeconds: 60,
    })
    const put = await fetch(signed.url, { method: 'PUT', headers: signed.headers, body: png })
    expect(put.status).toBe(200)
    const read = await storage.read(key, 2 * 1024 * 1024)
    expect(read).toMatchObject({ status: 'found', size: png.length })
    const download = await fetch(await storage.signedDownload(key, 60))
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(png)
    await storage.delete(key)
    expect(await storage.read(key, 1000)).toEqual({ status: 'missing' })
  })

  it('refuses a bigger file or another type under the same link', async () => {
    const key = `tests/${newId()}.png`
    const signed = await storage.signedUpload(key, {
      contentType: 'image/png',
      size: png.length,
      expiresInSeconds: 60,
    })
    const bigger = new Uint8Array(png.length + 10)
    const tooBig = await fetch(signed.url, { method: 'PUT', headers: signed.headers, body: bigger })
    expect(tooBig.status).toBe(403)
    const otherType = await fetch(signed.url, {
      method: 'PUT',
      headers: { 'content-type': 'image/svg+xml' },
      body: png,
    })
    expect(otherType.status).toBe(403)
    expect(await storage.read(key, 1000)).toEqual({ status: 'missing' })
  })

  it('refuses a second file under the same link, and copies a file server-side', async () => {
    const key = `tests/${newId()}.png`
    const signed = await storage.signedUpload(key, {
      contentType: 'image/png',
      size: png.length,
      expiresInSeconds: 60,
    })
    expect(signed.headers).toMatchObject({ 'if-none-match': '*' })
    const first = await fetch(signed.url, { method: 'PUT', headers: signed.headers, body: png })
    expect(first.status).toBe(200)
    // Same type and size, so only If-None-Match stops it.
    const other = png.slice()
    other.set([(png.at(-20) ?? 0) ^ 0xff], png.length - 20)
    const second = await fetch(signed.url, { method: 'PUT', headers: signed.headers, body: other })
    expect(second.status).toBe(412)
    expect(await storage.copy(key, `${key}.checked`)).toBe('copied')
    expect(await storage.read(`${key}.checked`, 1_000_000)).toMatchObject({ bytes: png })
    expect(await storage.copy(`tests/${newId()}.png`, `${key}.none`)).toBe('missing')
    await storage.delete(key)
    await storage.delete(`${key}.checked`)
  })

  it('reports a file over the limit without reading it', async () => {
    const key = `tests/${newId()}.png`
    const signed = await storage.signedUpload(key, {
      contentType: 'image/png',
      size: png.length,
      expiresInSeconds: 60,
    })
    await fetch(signed.url, { method: 'PUT', headers: signed.headers, body: png })
    expect(await storage.read(key, 100)).toEqual({ status: 'too_large', size: png.length })
    await storage.delete(key)
  })
})
