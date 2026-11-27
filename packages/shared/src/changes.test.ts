import { describe, expect, it } from 'vitest'
import {
  allowedActions,
  classifyNights,
  keptDeadline,
  lateChangePenalty,
  nightsDelta,
  penaltyApplies,
  penaltyBasisLabel,
  policyWords,
  signedDifference,
} from './changes.ts'
import type { CancellationPolicy } from './rates.ts'

const firstNight: CancellationPolicy = {
  kind: 'free_until',
  hours: 48,
  penalty: { kind: 'first_night' },
}
const thirty: CancellationPolicy = {
  kind: 'free_until',
  hours: 48,
  penalty: { kind: 'percent_of_stay', percent: '30.00' },
}
const nonRefundable: CancellationPolicy = { kind: 'non_refundable' }

describe('allowedActions', () => {
  it('follows the spec’s table', () => {
    const bd = '2026-11-25'
    expect(allowedActions('confirmed', '2026-11-26', bd)).toEqual({
      modify: true,
      cancel: true,
      noShow: false,
      blocked: null,
    })
    expect(allowedActions('confirmed', bd, bd)).toMatchObject({ modify: true, noShow: true })
    expect(allowedActions('confirmed', '2026-11-24', bd)).toEqual({
      modify: false,
      cancel: false,
      noShow: true,
      blocked: 'arrival_passed',
    })
    expect(allowedActions('cancelled', '2026-11-26', bd).blocked).toBe('ended')
    expect(allowedActions('no_show', bd, bd).noShow).toBe(false)
    expect(allowedActions('checked_in', bd, bd).blocked).toBe('in_house')
  })
})

describe('penaltyApplies', () => {
  // Free until 7 Dec 2026, 14:00 in Lagos (13:00 UTC).
  const deadline = new Date('2026-12-07T13:00:00Z')
  const at = (iso: string) => ({
    guaranteed: true,
    policy: firstNight,
    deadline,
    amount: '205800.00',
    now: new Date(iso),
  })

  it('is free at 13:59 and not at 14:00', () => {
    expect(penaltyApplies(at('2026-12-07T12:59:59Z'))).toBe(false)
    expect(penaltyApplies(at('2026-12-07T13:00:00Z'))).toBe(true)
  })

  it('always applies on a non-refundable plan and to a no-show, never unguaranteed or at ₦0', () => {
    const early = at('2026-11-01T00:00:00Z')
    expect(penaltyApplies({ ...early, policy: nonRefundable })).toBe(true)
    expect(penaltyApplies({ ...early, noShow: true })).toBe(true)
    expect(penaltyApplies({ ...at('2026-12-08T00:00:00Z'), guaranteed: false })).toBe(false)
    expect(penaltyApplies({ ...at('2026-12-08T00:00:00Z'), amount: '0.00' })).toBe(false)
  })
})

describe('lateChangePenalty', () => {
  const before = { total: '617400.00', firstNightGross: '205800.00' }

  it('charges the lower of the drop and the first night', () => {
    expect(lateChangePenalty(firstNight, before, { total: '411600.00' })).toBe('205800.00')
    expect(lateChangePenalty(firstNight, before, { total: '536550.00' })).toBe('80850.00')
  })

  it('charges N% of the drop, or all of it on non-refundable', () => {
    expect(lateChangePenalty(thirty, before, { total: '411600.00' })).toBe('61740.00')
    expect(lateChangePenalty(nonRefundable, before, { total: '205800.00' })).toBe('411600.00')
  })

  it('costs nothing when the total stays or rises', () => {
    expect(lateChangePenalty(firstNight, before, { total: '617400.00' })).toBeNull()
    expect(lateChangePenalty(firstNight, before, { total: '823200.00' })).toBeNull()
  })
})

describe('keptDeadline', () => {
  const now = new Date('2026-11-25T10:00:00Z')
  it('keeps a passed deadline passed and moves one still ahead', () => {
    const passed = new Date('2026-11-24T13:00:00Z')
    const later = new Date('2026-12-18T13:00:00Z')
    expect(keptDeadline(passed, later, now)).toBe(passed)
    const ahead = new Date('2026-12-07T13:00:00Z')
    expect(keptDeadline(ahead, later, now)).toBe(later)
  })
})

describe('classifyNights', () => {
  it('keeps unchanged nights and marks the rest new; every night on a new room type', () => {
    const before = { roomTypeId: 'dlk', dates: ['2026-12-09', '2026-12-10', '2026-12-11'] }
    expect(
      classifyNights(before, { roomTypeId: 'dlk', arrival: '2026-12-10', departure: '2026-12-13' }),
    ).toEqual([
      { date: '2026-12-10', kept: true },
      { date: '2026-12-11', kept: true },
      { date: '2026-12-12', kept: false },
    ])
    expect(
      classifyNights(before, { roomTypeId: 'exk', arrival: '2026-12-09', departure: '2026-12-10' }),
    ).toEqual([{ date: '2026-12-09', kept: false }])
  })
})

describe('words', () => {
  it('says the policy, the basis, the nights and the difference as the dialogs do', () => {
    expect(policyWords('Best available', firstNight, 'cancel')).toBe(
      'Best available: free until 48 h before arrival',
    )
    expect(policyWords('Best available', firstNight, 'no_show')).toBe(
      'Best available: a no-show is charged the first night',
    )
    expect(penaltyBasisLabel('percent_of_stay', '30.00')).toBe('30% of the stay')
    expect(nightsDelta(3, 4)).toBe('+1 night')
    expect(nightsDelta(4, 2)).toBe('−2 nights')
    expect(signedDifference('617400.00', '823200.00')).toEqual({ sign: 1, amount: '205800.00' })
    expect(signedDifference('617400.00', '411600.00')).toEqual({ sign: -1, amount: '205800.00' })
  })
})
