import { describe, expect, it } from 'vitest'
import { ALL_MODULES, visibleGroups } from './navigation'

const allOn = () => true
const labels = (
  role: Parameters<typeof visibleGroups>[0],
  has: Parameters<typeof visibleGroups>[1] = allOn,
  can?: (permission: string) => boolean,
) => visibleGroups(role, has, can).flatMap((group) => group.entries.map((entry) => entry.label))

describe('navigation', () => {
  it('shows owners every module, grouped as in the design', () => {
    expect(labels('owner')).toHaveLength(ALL_MODULES.length)
    expect(visibleGroups('owner', allOn).map((g) => g.label)).toEqual([
      'Front office',
      'Revenue',
      'Operations',
      'Back office',
    ])
  })

  it('shows each role only the modules it uses', () => {
    expect(labels('waiter')).toEqual(['Restaurant & bar'])
    expect(labels('room_attendant')).toEqual(['Tape chart', 'Housekeeping'])
    expect(labels('front_desk')).toEqual([
      'Reservations',
      'Tape chart',
      'Front desk',
      'Cash',
      'Guests & sales',
      'Housekeeping',
    ])
  })

  it('shows Cash to whoever runs a shift or reads every shift', () => {
    const cash = (role: Parameters<typeof visibleGroups>[0], can: (p: string) => boolean) =>
      labels(role, allOn, can).includes('Cash')
    expect(cash('cashier', (p) => p === 'cashier_shift.operate')).toBe(true)
    expect(cash('finance', (p) => p === 'leakage.view')).toBe(true)
    expect(cash('waiter', () => false)).toBe(false)
  })

  it('hides modules that are switched off for the group', () => {
    expect(labels('owner', (feature) => feature === 'restaurant_pos')).toEqual(['Restaurant & bar'])
    expect(visibleGroups('owner', () => false)).toEqual([])
  })

  it('shows a built module to roles with any of its permissions, whatever the role', () => {
    const rates = (can: (p: string) => boolean) =>
      labels('front_desk', allOn, can).includes('Rates & channels')
    expect(rates(() => false)).toBe(false)
    expect(rates((p) => p === 'rooms.setup')).toBe(true)
    // Rate plans (brick 2): a revenue manager edits rates without setting up rooms.
    expect(rates((p) => p === 'rates.edit')).toBe(true)
    // The front desk reads rates to quote by phone.
    expect(rates((p) => p === 'reservation.manage')).toBe(true)
    // A GM whose rooms and rates permissions were taken away no longer sees it.
    expect(labels('general_manager', allOn, () => false)).not.toContain('Rates & channels')
  })

  it('gives every module a unique path', () => {
    const paths = ALL_MODULES.map((entry) => entry.to)
    expect(new Set(paths).size).toBe(paths.length)
  })
})
