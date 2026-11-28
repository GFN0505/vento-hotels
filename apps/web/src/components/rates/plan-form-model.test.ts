import type { RatePlanView } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { check, formFrom, toInput } from './plan-form-model'
import { ownPricesFromPreview, previewRows } from './preview-model'

const HOTEL = '01934b6e-0000-7000-8000-0000000000aa'
const STQ = '01934b6e-0000-7000-8000-000000000001'
const DLK = '01934b6e-0000-7000-8000-000000000002'
const BAR = '01934b6e-0000-7000-8000-000000000003'
const TYPES = [STQ, DLK]

const bar: RatePlanView = {
  id: BAR,
  propertyId: HOTEL,
  name: 'Best available',
  code: 'BAR',
  pricing: 'own',
  parent: null,
  adjustment: null,
  roomTypes: [
    { roomTypeId: STQ, weekday: '120000.00', weekend: null },
    { roomTypeId: DLK, weekday: '150000.00', weekend: '165000.00' },
  ],
  mealPlan: 'room_only',
  mealAllocation: null,
  cancellation: { kind: 'free_until', hours: 48, penalty: { kind: 'first_night' } },
  deposit: { kind: 'first_night', due: { kind: 'within_hours', hours: 48 } },
  minStay: 1,
  extraAdult: null,
  bookableBy: 'anyone',
  pricesIncludeTaxes: false,
  currency: 'NGN',
  sortOrder: 0,
  archivedAt: null,
  version: 3,
  followers: [],
  datedFromBusinessDate: 0,
  canDelete: false,
}

describe('plan form', () => {
  it('starts a new plan all-in and keeps a saved plan’s basis (decision 0032)', () => {
    expect(formFrom(undefined, TYPES).pricesIncludeTaxes).toBe(true)
    expect(formFrom({ ...bar, pricesIncludeTaxes: false }, TYPES).pricesIncludeTaxes).toBe(false)
  })

  it('round-trips a plan with its own prices into the same input', () => {
    const input = toInput(formFrom(bar, TYPES), HOTEL, TYPES)
    expect(input.roomTypes).toEqual([
      { roomTypeId: STQ, weekday: '120,000', weekend: null },
      { roomTypeId: DLK, weekday: '150,000', weekend: '165,000' },
    ])
    expect(input.cancellation).toEqual(bar.cancellation)
    expect(input.deposit).toEqual(bar.deposit)
  })

  it('duplicates everything but the name and code', () => {
    const copy = formFrom(bar, TYPES, { copy: true })
    expect(copy.name).toBe('Best available copy')
    expect(copy.code).toBe('')
    expect(copy.rows[DLK]).toEqual({ on: true, weekday: '150,000', weekend: '165,000' })
  })

  it('names the room type whose weekday price is missing', () => {
    const form = formFrom(bar, TYPES)
    form.rows[DLK] = { on: true, weekday: '', weekend: '' }
    expect(check(form, HOTEL, TYPES).problems[`weekday-${DLK}`]).toBe('Enter a weekday price')
  })

  it('asks a derived plan for a parent and one adjustment, not both', () => {
    const form = { ...formFrom(undefined, TYPES), name: 'Non-refundable', code: 'NRF' }
    form.pricing = 'derived'
    expect(check(form, HOTEL, TYPES).problems.parentId).toBe('Choose a parent plan')
    const both = { ...form, parentId: BAR, offset: '5000', percent: '-10' }
    expect(check(both, HOTEL, TYPES).problems.percent).toBe(
      'Enter an offset or a percentage, not both',
    )
    expect(check({ ...form, parentId: BAR, percent: '-10' }, HOTEL, TYPES).ok).toBe(true)
  })

  it('asks for the meal allocation once breakfast is included on own prices', () => {
    const form = { ...formFrom(bar, TYPES), mealPlan: 'bed_breakfast' as const }
    expect(check(form, HOTEL, TYPES).problems.mealAllocation).toMatch(/meal allocation/)
  })
})

describe('preview', () => {
  const parent = new Map([
    [STQ, '120000.00'],
    [DLK, '150000.00'],
  ])

  it('derives each room type from the parent with the shared rounding', () => {
    const form = { ...formFrom(undefined, TYPES), pricing: 'derived' as const, percent: '-12.5' }
    const rows = previewRows(form, TYPES, parent)
    expect(rows.map((r) => r.price)).toEqual(['105000.00', '131250.00'])
    expect(ownPricesFromPreview(rows)).toEqual({ [STQ]: '105,000', [DLK]: '131,250' })
  })

  it('flags a price of ₦0 or less and waits for a valid adjustment', () => {
    const form = { ...formFrom(undefined, TYPES), pricing: 'derived' as const, offset: '-130000' }
    expect(previewRows(form, TYPES, parent).map((r) => r.notPositive)).toEqual([true, false])
    expect(previewRows({ ...form, offset: '-' }, TYPES, parent)[0]?.price).toBeNull()
  })
})
