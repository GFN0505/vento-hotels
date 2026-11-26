import { describe, expect, it } from 'vitest'
import { MEMBER_ROLES, ROLE_FILTERS, ROLE_INFO, roleLabel } from './roles.ts'

describe('roles', () => {
  it('names every role, with a unique short code', () => {
    expect(Object.keys(ROLE_INFO).sort()).toEqual([...MEMBER_ROLES].sort())
    const codes = Object.values(ROLE_INFO).map((info) => info.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('puts every role in exactly one members-list filter', () => {
    const filtered = Object.values(ROLE_FILTERS).flat()
    expect([...filtered].sort()).toEqual([...MEMBER_ROLES].sort())
  })

  it('falls back to the raw value for an unknown role', () => {
    expect(roleLabel('front_desk')).toBe('Front desk')
    expect(roleLabel('something_else')).toBe('something_else')
  })
})
