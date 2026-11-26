import { describe, expect, it } from 'vitest'
import { ALL_MODULES, visibleGroups } from './navigation'

const allOn = () => true
const labels = (
  role: Parameters<typeof visibleGroups>[0],
  has: Parameters<typeof visibleGroups>[1] = allOn,
) => visibleGroups(role, has).flatMap((group) => group.entries.map((entry) => entry.label))

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
    expect(labels('room_attendant')).toEqual(['Housekeeping'])
    expect(labels('front_desk')).toEqual([
      'Reservations',
      'Tape chart',
      'Front desk',
      'Guests & sales',
      'Housekeeping',
    ])
  })

  it('hides modules that are switched off for the group', () => {
    expect(labels('owner', (feature) => feature === 'restaurant_pos')).toEqual(['Restaurant & bar'])
    expect(visibleGroups('owner', () => false)).toEqual([])
  })

  it('gives every module a unique path', () => {
    const paths = ALL_MODULES.map((entry) => entry.to)
    expect(new Set(paths).size).toBe(paths.length)
  })
})
