import { describe, expect, it } from 'vitest'
import { isStrongPassword, unmetPasswordRules } from './password.ts'

describe('password rule', () => {
  it('accepts 8+ characters with a capital, a small letter, a number and a special character', () => {
    expect(isStrongPassword('Kora-Hotel1')).toBe(true)
    expect(isStrongPassword('Aa1!aaaa')).toBe(true)
  })

  it('names each rule that is not met yet', () => {
    expect(unmetPasswordRules('')).toEqual(['length', 'upper', 'lower', 'digit', 'special'])
    expect(unmetPasswordRules('aa1!aaaa')).toEqual(['upper'])
    expect(unmetPasswordRules('AA1!AAAA')).toEqual(['lower'])
    expect(unmetPasswordRules('Aa!aaaaa')).toEqual(['digit'])
    expect(unmetPasswordRules('Aa1aaaaa')).toEqual(['special'])
    expect(unmetPasswordRules('Aa1!aaa')).toEqual(['length'])
  })

  it('does not count a space as the special character', () => {
    expect(unmetPasswordRules('Aa1 aaaa')).toEqual(['special'])
  })

  it('counts Nigerian names and accented letters as letters', () => {
    expect(isStrongPassword('Ọlá-Ìbí7')).toBe(true)
  })
})
