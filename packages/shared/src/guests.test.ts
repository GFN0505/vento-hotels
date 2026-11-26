import { describe, expect, it } from 'vitest'
import { formatPhone, guestFieldsSchema, maskPhone, normalizePhone } from './guests.ts'

describe('phone numbers', () => {
  it('stores a Nigerian number typed with 0 as +234', () => {
    expect(normalizePhone('0803 456 4567')).toBe('+2348034564567')
    expect(normalizePhone('2348034564567')).toBe('+2348034564567')
  })
  it('needs the country code for foreign numbers', () => {
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123')
    expect(normalizePhone('0044 7700 900123')).toBe('+447700900123')
    expect(normalizePhone('7700 900123')).toBeNull()
    expect(normalizePhone('+12')).toBeNull()
  })
  it('masks and formats', () => {
    expect(maskPhone('+2348034564567')).toBe('+234 803 ••• 4567')
    expect(formatPhone('+2348034564567')).toBe('+234 803 456 4567')
    expect(formatPhone('+447700900123')).toBe('+44 7700 900123')
  })
})

describe('guest fields', () => {
  it('needs a phone or an email', () => {
    const result = guestFieldsSchema.safeParse({ firstName: 'Sarah', lastName: 'Collins' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Enter a phone number or an email, so the hotel can reach the guest.',
    )
  })
  it('defaults to Nigerian and normalises the phone', () => {
    expect(
      guestFieldsSchema.parse({
        firstName: 'Ada',
        lastName: 'Obi',
        phone: '08034564567',
        email: '',
      }),
    ).toEqual({ firstName: 'Ada', lastName: 'Obi', phone: '+2348034564567', nationality: 'NG' })
  })
})
