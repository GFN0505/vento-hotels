import { describe, expect, it } from 'vitest'
import { isAcceptablePin, pinProblem } from './pin.ts'

describe('staff PIN', () => {
  it('needs exactly 4 digits', () => {
    expect(pinProblem('123')).toBe('Use 4 digits')
    expect(pinProblem('12a4')).toBe('Use 4 digits')
    expect(pinProblem('29481')).toBe('Use 4 digits')
  })

  it('refuses obvious PINs', () => {
    for (const pin of [
      '0000',
      '7777',
      '1234',
      '6789',
      '4321',
      '9876',
      '1212',
      '2580',
      '1990',
      '2026',
    ]) {
      expect(isAcceptablePin(pin), pin).toBe(false)
    }
  })

  it('accepts ordinary PINs', () => {
    for (const pin of ['2948', '1357', '0912', '1123', '8391'])
      expect(isAcceptablePin(pin), pin).toBe(true)
  })
})
