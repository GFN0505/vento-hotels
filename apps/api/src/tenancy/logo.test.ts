// Hotel logos: a signed upload URL, then the API checks the stored file before the hotel uses it.
// Storage is in memory here; providers/storage.test.ts covers the real S3 API against RustFS.
import type { LogoUpload, Property } from '@vento/shared'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileUploads } from '../db/schema/tenancy.ts'
import { solidPng } from '../storage/png.ts'
import { createTestApp } from '../test/harness.ts'
import { checkedKey, purgeUnconfirmedUploads } from './logo.ts'
import { type Kora, koraGroup, lastEvent, type Problem } from './testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('hotel logos', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let kora: Kora

  // Asks for an upload URL and, unless told not to, "uploads" the bytes as the browser would.
  const upload = async (bytes: Uint8Array | null, propertyId = kora.abuja.id) => {
    const asked = await t.rpc<LogoUpload>(kora.owner.cookie, 'properties/logoUploadUrl', {
      propertyId,
      contentType: 'image/png',
      size: bytes?.length ?? 1000,
    })
    expect(asked.status).toBe(200)
    const key = new URL(asked.data.url).pathname.replace(/^\//, '')
    if (bytes) t.storage.put(key, bytes)
    return { ...asked.data, key }
  }
  const setLogo = (uploadId: string, propertyId = kora.abuja.id, cookie = kora.owner.cookie) =>
    t.rpc<Property & Problem>(cookie, 'properties/setLogo', { propertyId, uploadId })

  beforeAll(async () => {
    kora = await koraGroup(t)
  })

  it('gives a 5-minute upload link with a new key under the group and hotel each time', async () => {
    const first = await upload(null)
    const second = await upload(null)
    expect(first.key).toMatch(
      new RegExp(`^logos/${kora.orgId}/${kora.abuja.id}/uploads/[0-9a-f-]+\\.png$`),
    )
    expect(second.key).not.toBe(first.key)
    // If-None-Match: * is part of the signed request, so the link can't replace a file.
    expect(first).toMatchObject({
      method: 'PUT',
      headers: { 'content-type': 'image/png', 'if-none-match': '*' },
    })
    const minutes = (Date.parse(first.expiresAt) - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(4)
    expect(minutes).toBeLessThanOrEqual(5)
  })

  it('refuses files over 2 MB and types other than PNG and JPEG before any upload', async () => {
    const big = await t.rpc<Problem>(kora.owner.cookie, 'properties/logoUploadUrl', {
      propertyId: kora.abuja.id,
      contentType: 'image/png',
      size: 2 * 1024 * 1024 + 1,
    })
    expect(big.status).toBe(400)
    const svg = await t.rpc(kora.owner.cookie, 'properties/logoUploadUrl', {
      propertyId: kora.abuja.id,
      contentType: 'image/svg+xml',
      size: 100,
    })
    expect(svg.status).toBe(400)
  })

  it('checks the stored file and puts it on the hotel, with an audit event', async () => {
    const sent = await upload(solidPng(400, 300, [20, 40, 60]))
    const saved = await setLogo(sent.uploadId)
    expect(saved.status).toBe(200)
    expect(saved.data.logo).toEqual({
      uploadId: sent.uploadId,
      url: expect.stringContaining(checkedKey(sent.key)),
    })
    expect(t.storage.files.has(sent.key)).toBe(false)
    expect(await lastEvent(t, kora.owner, 'property', kora.abuja.id)).toMatchObject({
      action: 'property.logo_changed',
      after: expect.objectContaining({ width: 400, height: 300, contentType: 'image/png' }),
    })
  })

  it('refuses a logo under 200 px on a side, deletes it and keeps the old one', async () => {
    const good = await upload(solidPng(300, 300, [0, 0, 0]))
    await setLogo(good.uploadId)
    const small = await upload(solidPng(120, 400, [0, 0, 0]))
    const refused = await setLogo(small.uploadId)
    expect(refused.status).toBe(400)
    expect(refused.data.message).toBe(
      'This logo is 120 px wide. Use one at least 200 px on each side.',
    )
    expect(t.storage.files.has(small.key)).toBe(false)
    expect(t.storage.files.has(checkedKey(small.key))).toBe(false)
    const property = await t.rpc<Property>(kora.owner.cookie, 'properties/get', {
      id: kora.abuja.id,
    })
    expect(property.data.logo?.uploadId).toBe(good.uploadId)
  })

  it('refuses a file that only claims to be a PNG', async () => {
    const fake = await upload(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))
    const refused = await setLogo(fake.uploadId)
    expect(refused.data).toMatchObject({
      message: 'Use a PNG or JPEG up to 2 MB.',
      data: { code: 'LOGO_INVALID' },
    })
    const [row] = await t.db
      .select({ status: fileUploads.status })
      .from(fileUploads)
      .where(eq(fileUploads.id, fake.uploadId))
    expect(row?.status).toBe('rejected')
  })

  it('never lets a second upload under the same link change a checked logo', async () => {
    const sent = await upload(solidPng(400, 400, [1, 1, 1]))
    await setLogo(sent.uploadId)
    const checked = t.storage.files.get(checkedKey(sent.key))
    // Whatever arrives later under the upload link stays at the upload key, which nothing reads.
    await t.storage.put(sent.key, new TextEncoder().encode('<svg onload="alert(1)"></svg>'))
    const again = await setLogo(sent.uploadId)
    expect(again.status).toBe(200)
    expect(t.storage.files.get(checkedKey(sent.key))).toBe(checked)
    expect(again.data.logo?.url).toContain(checkedKey(sent.key))
  })

  it('refuses an upload confirmed more than an hour after its link was given', async () => {
    const late = await upload(solidPng(300, 300, [5, 5, 5]))
    await t.db
      .update(fileUploads)
      .set({ createdAt: new Date(Date.now() - 61 * 60 * 1000) })
      .where(eq(fileUploads.id, late.uploadId))
    const refused = await setLogo(late.uploadId)
    expect(refused.data.data).toMatchObject({ code: 'LOGO_NOT_UPLOADED' })
  })

  it('says the logo didn’t upload when the file never arrived', async () => {
    const missing = await upload(null)
    const refused = await setLogo(missing.uploadId)
    expect(refused.data).toMatchObject({
      message: "The logo didn't upload. Try again.",
      data: { code: 'LOGO_NOT_UPLOADED' },
    })
  })

  it('removes a logo without deleting the file, and Undo brings it back', async () => {
    const sent = await upload(solidPng(500, 500, [200, 100, 0]))
    await setLogo(sent.uploadId)
    const removed = await t.rpc<Property>(kora.owner.cookie, 'properties/removeLogo', {
      propertyId: kora.abuja.id,
    })
    expect(removed.data.logo).toBeNull()
    expect(t.storage.files.has(checkedKey(sent.key))).toBe(true)
    expect((await lastEvent(t, kora.owner, 'property', kora.abuja.id))?.action).toBe(
      'property.logo_removed',
    )
    const undone = await setLogo(sent.uploadId)
    expect(undone.data.logo?.uploadId).toBe(sent.uploadId)
  })

  it("never uses an upload from another hotel or group, nor sets another group's logo", async () => {
    const forAbuja = await upload(solidPng(300, 300, [1, 2, 3]))
    const elsewhere = await setLogo(forAbuja.uploadId, kora.vi.id)
    expect(elsewhere.data.data).toMatchObject({ code: 'LOGO_NOT_UPLOADED' })
    const other = await setLogo(forAbuja.uploadId, kora.otherHotel.id)
    expect(other.status).toBe(404)
    const asked = await t.rpc(kora.owner.cookie, 'properties/logoUploadUrl', {
      propertyId: kora.otherHotel.id,
      contentType: 'image/png',
      size: 100,
    })
    expect(asked.status).toBe(404)
  })

  it('keeps logos with people who manage setup', async () => {
    const asked = await t.rpc(kora.gm.cookie, 'properties/logoUploadUrl', {
      propertyId: kora.vi.id,
      contentType: 'image/png',
      size: 100,
    })
    expect(asked.status).toBe(403)
  })

  it('deletes uploads never confirmed, and rejected ones sent again, after a day', async () => {
    const stale = await upload(solidPng(300, 300, [9, 9, 9]))
    const rejected = await upload(solidPng(100, 100, [9, 9, 9]))
    await setLogo(rejected.uploadId)
    // Sent again under its link after the rejection.
    await t.storage.put(rejected.key, solidPng(100, 100, [9, 9, 9]))
    const tomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000)
    expect(await purgeUnconfirmedUploads(t.db, t.storage, tomorrow)).toBeGreaterThan(0)
    expect(t.storage.files.has(stale.key)).toBe(false)
    expect(t.storage.files.has(rejected.key)).toBe(false)
    const rows = await t.db
      .select({ id: fileUploads.id, status: fileUploads.status, purgedAt: fileUploads.purgedAt })
      .from(fileUploads)
      .where(inArray(fileUploads.id, [stale.uploadId, rejected.uploadId]))
    const byId = new Map(rows.map((row) => [row.id, row]))
    expect(byId.get(stale.uploadId)).toMatchObject({ status: 'expired', purgedAt: tomorrow })
    expect(byId.get(rejected.uploadId)).toMatchObject({ status: 'rejected', purgedAt: tomorrow })
  })
})
