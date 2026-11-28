import { afterEach, describe, expect, it } from 'vitest'
import {
  decryptId,
  devGuestKeyAllowed,
  encryptId,
  idFingerprint,
  resetKeysForTests,
} from './crypto.ts'

describe('guest ID encryption (decision 0031)', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env.ALLOW_DEV_GUEST_DATA_KEY = saved.ALLOW_DEV_GUEST_DATA_KEY
    process.env.NODE_ENV = saved.NODE_ENV
    if (saved.DEPLOY_ENV === undefined) delete process.env.DEPLOY_ENV
    else process.env.DEPLOY_ENV = saved.DEPLOY_ENV
    delete process.env.GUEST_DATA_KEY
    delete process.env.GUEST_DATA_PREVIOUS_KEYS
    resetKeysForTests()
  })

  it('round-trips, with a fresh IV each time and no plain digits in the stored form', () => {
    const a = encryptId('12345678901')
    const b = encryptId('12345678901')
    expect(a).not.toBe(b)
    expect(a).not.toContain('12345678901')
    expect(a.startsWith('v1.')).toBe(true)
    expect(decryptId(a)).toBe('12345678901')
  })

  it('refuses the development key unless asked for on a local, non-production server', () => {
    delete process.env.ALLOW_DEV_GUEST_DATA_KEY
    resetKeysForTests()
    expect(() => encryptId('12345678901')).toThrow('GUEST_DATA_KEY is not set')
    process.env.ALLOW_DEV_GUEST_DATA_KEY = 'true'
    process.env.DEPLOY_ENV = 'staging'
    resetKeysForTests()
    expect(() => encryptId('12345678901')).toThrow('GUEST_DATA_KEY is not set')
    expect(devGuestKeyAllowed({ ALLOW_DEV_GUEST_DATA_KEY: 'true' })).toBe(true)
    expect(devGuestKeyAllowed({ ALLOW_DEV_GUEST_DATA_KEY: 'true', NODE_ENV: 'production' })).toBe(
      false,
    )
    expect(devGuestKeyAllowed({ ALLOW_DEV_GUEST_DATA_KEY: 'true', DEPLOY_ENV: 'production' })).toBe(
      false,
    )
    expect(devGuestKeyAllowed({})).toBe(false)
  })

  it('fingerprints the whole number with a key: same number same print, never the digits', () => {
    expect(idFingerprint('12345678901')).toBe(idFingerprint('12345678901'))
    // Same mask (••••••8901), different numbers.
    expect(idFingerprint('12345678901')).not.toBe(idFingerprint('99999998901'))
    expect(idFingerprint('12345678901')).not.toContain('8901')
    const before = idFingerprint('12345678901')
    process.env.GUEST_DATA_KEY = Buffer.alloc(32, 3).toString('base64')
    resetKeysForTests()
    expect(idFingerprint('12345678901')).not.toBe(before)
  })

  it('reads rows written with a previous key after rotation', () => {
    process.env.GUEST_DATA_KEY = Buffer.alloc(32, 1).toString('base64')
    resetKeysForTests()
    const old = encryptId('A01234567')
    process.env.GUEST_DATA_PREVIOUS_KEYS = process.env.GUEST_DATA_KEY
    process.env.GUEST_DATA_KEY = Buffer.alloc(32, 2).toString('base64')
    resetKeysForTests()
    expect(decryptId(old)).toBe('A01234567')
    expect(encryptId('x').split('.')[1]).not.toBe(old.split('.')[1])
  })

  it('refuses a tampered value', () => {
    const stored = encryptId('A01234567')
    const parts = stored.split('.')
    parts[4] = Buffer.from('B01234567').toString('base64url')
    expect(() => decryptId(parts.join('.'))).toThrow()
  })
})
