import { describe, expect, it } from 'vitest'
import {
  normalizeRcNumber,
  normalizeTin,
  rcNumberSchema,
  tinDigits,
  tinSchema,
} from './company-ids.ts'

describe('RC numbers', () => {
  it('stores every accepted spelling as prefix, space, digits', () => {
    expect(normalizeRcNumber('RC 1184402')).toBe('RC 1184402')
    expect(normalizeRcNumber('rc1184402')).toBe('RC 1184402')
    expect(normalizeRcNumber('RC-1184402')).toBe('RC 1184402')
    expect(normalizeRcNumber('BN 3456789')).toBe('BN 3456789')
    expect(normalizeRcNumber('llp 1234')).toBe('LLP 1234')
    expect(normalizeRcNumber('LP 99')).toBe('LP 99')
  })

  it('reads bare digits as an RC number', () => {
    expect(normalizeRcNumber(' 1184402 ')).toBe('RC 1184402')
  })

  it('refuses other prefixes, letters and more than 8 digits', () => {
    expect(normalizeRcNumber('XY 1184402')).toBeNull()
    expect(normalizeRcNumber('RC 123456789')).toBeNull()
    expect(normalizeRcNumber('RC')).toBeNull()
    expect(rcNumberSchema.safeParse('ABC').error?.issues[0]?.message).toBe(
      'Use a CAC number like RC 1184402 or BN 3456789',
    )
  })
})

describe('TINs', () => {
  it('accepts 8 to 14 digits with an optional hyphen', () => {
    expect(normalizeTin('21847390-0001')).toBe('21847390-0001')
    expect(normalizeTin('2184 7390 0001')).toBe('218473900001')
    expect(normalizeTin('12345678')).toBe('12345678')
    expect(normalizeTin('12345678901234')).toBe('12345678901234')
  })

  it('refuses too few or too many digits, letters and two hyphens', () => {
    expect(normalizeTin('1234567')).toBeNull()
    expect(normalizeTin('123456789012345')).toBeNull()
    expect(normalizeTin('TIN-12345678')).toBeNull()
    expect(normalizeTin('1234-5678-0001')).toBeNull()
    expect(tinSchema.safeParse('12').success).toBe(false)
  })

  it('compares TINs by their digits', () => {
    expect(tinDigits('21847390-0001')).toBe(tinDigits('218473900001'))
  })
})
