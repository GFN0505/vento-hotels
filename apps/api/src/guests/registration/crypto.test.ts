import { afterEach, describe, expect, it } from 'vitest'
import { decryptId, encryptId, resetKeysForTests } from './crypto.ts'

describe('guest ID encryption (decision 0031)', () => {
  afterEach(() => {
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
