import { describe, expect, it } from 'vitest'
import { DEFAULT_MATRIX, defaultRule, limitKindOf, PERMISSION_KEYS } from './permissions.ts'
import { MEMBER_ROLES } from './roles.ts'

describe('default permissions matrix (docs/DOMAIN.md)', () => {
  it('covers every role', () => {
    expect(Object.keys(DEFAULT_MATRIX).sort()).toEqual([...MEMBER_ROLES].sort())
  })

  it('gives the owner everything, and only the owner changes permissions', () => {
    for (const key of PERMISSION_KEYS) expect(defaultRule('owner', key).allowed).toBe(true)
    expect(defaultRule('group_admin', 'permissions.manage').allowed).toBe(false)
    expect(defaultRule('general_manager', 'permissions.manage').allowed).toBe(false)
  })

  it('matches the seed limits in the DOMAIN table', () => {
    expect(defaultRule('front_desk', 'stay.rate_override')).toEqual({ allowed: true, limit: '10' })
    expect(defaultRule('revenue_manager', 'stay.rate_override').limit).toBe('25')
    expect(defaultRule('general_manager', 'stay.rate_override').limit).toBe('50')
    expect(defaultRule('general_manager', 'refund').limit).toBe('100000')
    expect(defaultRule('finance', 'refund')).toEqual({ allowed: true, limit: null })
    expect(defaultRule('cashier', 'pos.discount').limit).toBe('5')
    expect(defaultRule('fnb_manager', 'pos.discount').limit).toBe('20')
  })

  it('denies what the table leaves blank', () => {
    expect(defaultRule('waiter', 'pos.void_after_send').allowed).toBe(false)
    expect(defaultRule('front_desk', 'refund').allowed).toBe(false)
    expect(defaultRule('viewer', 'reservation.manage').allowed).toBe(false)
  })

  it('only sets limits on permissions that have a limit kind', () => {
    for (const role of MEMBER_ROLES) {
      for (const key of PERMISSION_KEYS) {
        const rule = defaultRule(role, key)
        if (rule.limit !== null) expect(limitKindOf(key)).toBeDefined()
      }
    }
  })
})
