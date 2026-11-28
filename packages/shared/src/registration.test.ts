import { describe, expect, it } from 'vitest'
import {
  idNumberProblem,
  isEcowas,
  maskIdNumber,
  missingFields,
  registrationWarnings,
} from './registration.ts'

describe('registration helpers', () => {
  it('masks passports by their ends and national numbers by the last four', () => {
    expect(maskIdNumber('passport', 'a0123 4567')).toBe('A0•••••67')
    expect(maskIdNumber('nin', '12345678901')).toBe('••••••8901')
    expect(maskIdNumber('visa', 'V3307001')).toBe('••••••7001')
  })

  it('checks ID shapes: 11 digits for a NIN, 4–20 letters, digits or hyphens otherwise', () => {
    expect(idNumberProblem('nin', '1234567890')).toBe('A NIN has 11 digits.')
    expect(idNumberProblem('nin', '12345678901')).toBeNull()
    expect(idNumberProblem('passport', 'A0-12345')).toBeNull()
    expect(idNumberProblem('passport', 'A0!')).not.toBeNull()
  })

  it('knows the ECOWAS list without the three states that left', () => {
    expect(isEcowas('GH')).toBe(true)
    expect(isEcowas('ML')).toBe(false)
    expect(isEcowas('BF')).toBe(false)
  })

  it('treats Not required as the visa number and expiry for ECOWAS citizens', () => {
    expect(
      missingFields(
        { visaType: 'not_required' },
        ['visa_type', 'visa_number', 'visa_valid_until'],
        { hasContact: true },
      ),
    ).toEqual([])
  })

  it('warns, never blocks, about expiring documents', () => {
    expect(
      registrationWarnings(
        { idExpiry: '2026-03-03', visaType: 'business', visaValidUntil: '2026-11-26' },
        { departure: '2026-11-28', today: '2026-11-25' },
      ),
    ).toEqual([
      "Passport expired 3 Mar 2026. Check the guest's travel document.",
      'Visa ends 26 Nov 2026, before departure on 28 Nov.',
    ])
  })
})
