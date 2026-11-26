import { describe, expect, it } from 'vitest'
import { createRatePlanSchema, setRateDatesSchema } from './contracts/rates.ts'
import { dec } from './money.ts'
import {
  addYears,
  type DateCell,
  derivePrice,
  firstNightBelowAllocation,
  firstNonPositiveNight,
  foreignEquivalent,
  formatNaira,
  formatRateDate,
  isWeekendNight,
  lastRateDate,
  nightOf,
  noDatesMessage,
  ownPriceOn,
  quoteNights,
  rateAdjustmentSchema,
  ratePlanCodeSchema,
  ratePriceSchema,
  roundToNaira,
  selectDates,
  standardPriceOn,
  suggestPlanCode,
  weekdayOf,
} from './rates.ts'

const cell = (overrides: Partial<DateCell> = {}): DateCell => ({
  price: null,
  closed: false,
  closedToArrival: false,
  minStay: null,
  ...overrides,
})
const source = (
  weekday: string,
  weekend: string | null = null,
  dates: Record<string, DateCell> = {},
  extraAdult: string | null = null,
) => ({ standard: { weekday, weekend }, dates: new Map(Object.entries(dates)), extraAdult })

describe('rate prices typed by staff', () => {
  it('accepts whole naira in any common spelling and stores the canonical amount', () => {
    expect(ratePriceSchema.parse('120000')).toBe('120000.00')
    expect(ratePriceSchema.parse('120,000')).toBe('120000.00')
    expect(ratePriceSchema.parse(' 150000.00 ')).toBe('150000.00')
    expect(ratePriceSchema.parse('100000000')).toBe('100000000.00')
  })

  it('refuses kobo, zero, negatives and anything over ₦100,000,000', () => {
    expect(ratePriceSchema.safeParse('120000.50').error?.issues[0]?.message).toBe(
      'Enter whole naira, without kobo',
    )
    expect(ratePriceSchema.safeParse('0').error?.issues[0]?.message).toBe(
      'Enter a price above ₦0. For a free night, comp it on the stay.',
    )
    expect(ratePriceSchema.safeParse('-5000').success).toBe(false)
    expect(ratePriceSchema.safeParse('100000001').error?.issues[0]?.message).toBe(
      'Enter a price up to ₦100,000,000',
    )
    expect(ratePriceSchema.safeParse('').success).toBe(false)
  })
})

describe('rate plan codes and adjustments', () => {
  it('upper-cases codes of 2 to 10 letters, digits or hyphens', () => {
    expect(ratePlanCodeSchema.parse('nrf')).toBe('NRF')
    expect(ratePlanCodeSchema.parse('ACME-BB')).toBe('ACME-BB')
    expect(ratePlanCodeSchema.safeParse('A').success).toBe(false)
    expect(ratePlanCodeSchema.safeParse('ABCDEFGHIJK').success).toBe(false)
    expect(ratePlanCodeSchema.safeParse('NR F').success).toBe(false)
  })

  it('suggests a code from the name', () => {
    expect(suggestPlanCode('Non-refundable')).toBe('NR')
    expect(suggestPlanCode('Bed & breakfast')).toBe('BB')
    expect(suggestPlanCode('Best available')).toBe('BA')
    expect(suggestPlanCode('Corporate')).toBe('COR')
    expect(suggestPlanCode('  ')).toBe('')
  })

  it('takes a percentage from -90% to +100% with up to 2 decimals', () => {
    const percent = (value: string) => rateAdjustmentSchema.safeParse({ kind: 'percent', value })
    expect(percent('-10').data).toEqual({ kind: 'percent', value: '-10.00' })
    expect(percent('3.5').data?.value).toBe('3.50')
    expect(percent('-90').success).toBe(true)
    expect(percent('100').success).toBe(true)
    expect(percent('-90.01').success).toBe(false)
    expect(percent('100.01').success).toBe(false)
    expect(percent('1.234').success).toBe(false)
  })

  it('takes an amount per night in whole naira, either sign', () => {
    const amount = (value: string) => rateAdjustmentSchema.safeParse({ kind: 'amount', value })
    expect(amount('18000').data).toEqual({ kind: 'amount', value: '18000.00' })
    expect(amount('-5,000').data?.value).toBe('-5000.00')
    expect(amount('+18000').data?.value).toBe('18000.00')
    expect(amount('18000.50').success).toBe(false)
    expect(amount('100000001').success).toBe(false)
  })
})

describe('derived prices', () => {
  it('follows the design examples', () => {
    expect(derivePrice('150000.00', { kind: 'percent', value: '3.50' })).toBe('155250.00')
    expect(derivePrice('120000.00', { kind: 'percent', value: '-10.00' })).toBe('108000.00')
    expect(derivePrice('150000.00', { kind: 'amount', value: '18000.00' })).toBe('168000.00')
  })

  it('rounds once, half-up, to the whole naira', () => {
    // 12,345 × 0.9 = 11,110.5 → 11,111; 12,344 × 0.9 = 11,109.6 → 11,110.
    expect(derivePrice('12345.00', { kind: 'percent', value: '-10.00' })).toBe('11111.00')
    expect(derivePrice('12344.00', { kind: 'percent', value: '-10.00' })).toBe('11110.00')
    // 33,333 × 1.015 = 33,832.995 → 33,833 (rounding the percentage first would give 33,832).
    expect(derivePrice('33333.00', { kind: 'percent', value: '1.50' })).toBe('33833.00')
    expect(derivePrice('101.00', { kind: 'percent', value: '-50.00' })).toBe('51.00')
    expect(derivePrice('99.00', { kind: 'percent', value: '-50.00' })).toBe('50.00')
    expect(roundToNaira(dec('0.4999999999999'))).toBe('0.00')
  })

  it('has no float error on tiny percentages or the largest prices', () => {
    expect(derivePrice('100000.00', { kind: 'percent', value: '0.01' })).toBe('100010.00')
    expect(derivePrice('100000000.00', { kind: 'percent', value: '100.00' })).toBe('200000000.00')
    expect(derivePrice('70000.00', { kind: 'percent', value: '0.00' })).toBe('70000.00')
  })

  it('can reach ₦0 or below, which saves refuse', () => {
    expect(derivePrice('4.00', { kind: 'percent', value: '-90.00' })).toBe('0.00')
    expect(derivePrice('5.00', { kind: 'percent', value: '-90.00' })).toBe('1.00')
    expect(derivePrice('120000.00', { kind: 'amount', value: '-150000.00' })).toBe('-30000.00')
  })
})

describe('which price a night gets', () => {
  it('treats Friday and Saturday nights as the weekend', () => {
    expect(weekdayOf('2026-11-26')).toBe(4)
    expect(isWeekendNight('2026-11-26')).toBe(false)
    expect(isWeekendNight('2026-11-27')).toBe(true)
    expect(isWeekendNight('2026-11-28')).toBe(true)
    expect(isWeekendNight('2026-11-29')).toBe(false)
  })

  it('uses the Fri and Sat price on weekend nights, and the weekday price when it is blank', () => {
    const standard = { weekday: '150000.00', weekend: '170000.00' }
    expect(standardPriceOn(standard, '2026-11-26')).toBe('150000.00')
    expect(standardPriceOn(standard, '2026-11-27')).toBe('170000.00')
    expect(standardPriceOn({ ...standard, weekend: null }, '2026-11-28')).toBe('150000.00')
  })

  it('prefers a date price over the standard price', () => {
    const s = source('150000.00', null, { '2026-12-05': cell({ price: '165000.00' }) })
    expect(ownPriceOn(s, '2026-12-05')).toEqual({ price: '165000.00', from: 'date' })
    expect(ownPriceOn(s, '2026-12-04')).toEqual({ price: '150000.00', from: 'standard' })
    // A restriction-only cell keeps the standard price.
    const closed = source('150000.00', null, { '2026-12-02': cell({ closed: true }) })
    expect(ownPriceOn(closed, '2026-12-02').from).toBe('standard')
  })

  it("follows the parent's date price, closures and min stay on a derived plan", () => {
    const parent = source('150000.00', null, {
      '2026-12-05': cell({ price: '165000.00', minStay: 2, closedToArrival: true }),
    })
    expect(nightOf(parent, { kind: 'amount', value: '18000.00' }, 1, '2026-12-05')).toEqual({
      date: '2026-12-05',
      price: '183000.00',
      from: 'date',
      closed: false,
      closedToArrival: true,
      minStay: 2,
    })
  })

  it("uses the larger of the plan's min stay and the date's", () => {
    const s = source('100000.00', null, { '2026-12-05': cell({ minStay: 2 }) })
    expect(nightOf(s, null, 3, '2026-12-05').minStay).toBe(3)
    expect(nightOf(s, null, 1, '2026-12-05').minStay).toBe(2)
    expect(nightOf(s, null, 1, '2026-12-06').minStay).toBe(1)
  })
})

describe('the first night a derived plan would be ₦0 or less', () => {
  const minus = (value: string) => ({ kind: 'amount' as const, value })

  it('finds the first weekday night when the weekday price is too low', () => {
    const s = source('120000.00', '200000.00')
    expect(firstNonPositiveNight(s, minus('-150000.00'), '2026-11-27', '2027-01-31')).toBe(
      '2026-11-29',
    )
  })

  it('finds a single low date price far ahead', () => {
    const s = source('120000.00', null, { '2027-01-12': cell({ price: '10000.00' }) })
    expect(firstNonPositiveNight(s, minus('-10000.00'), '2026-11-26', '2028-11-26')).toBe(
      '2027-01-12',
    )
  })

  it('ignores date prices outside the range and dates whose price covers the offset', () => {
    const s = source('120000.00', null, {
      '2026-11-20': cell({ price: '5000.00' }),
      '2026-12-01': cell({ price: '50000.00' }),
    })
    expect(firstNonPositiveNight(s, minus('-20000.00'), '2026-11-26', '2028-11-26')).toBeNull()
  })

  it('checks the weekend price only on nights it applies', () => {
    const s = source('120000.00', '15000.00')
    expect(firstNonPositiveNight(s, minus('-20000.00'), '2026-11-29', '2026-12-03')).toBeNull()
    expect(firstNonPositiveNight(s, minus('-20000.00'), '2026-11-29', '2026-12-04')).toBe(
      '2026-12-04',
    )
  })

  it('catches a percentage that rounds a tiny price to ₦0', () => {
    expect(
      firstNonPositiveNight(
        source('4.00'),
        { kind: 'percent', value: '-90.00' },
        '2026-11-26',
        '2026-11-26',
      ),
    ).toBe('2026-11-26')
  })
})

describe('the first night a meal plan would cost less than its meal allocation', () => {
  it('allows a price equal to the allocation and finds the first one below it', () => {
    const s = source('130000.00', null, {
      '2026-12-10': cell({ price: '18000.00' }),
      '2026-12-12': cell({ price: '17999.00' }),
    })
    expect(firstNightBelowAllocation(s, null, '18000.00', '2026-11-26', '2026-12-31')).toBe(
      '2026-12-12',
    )
    expect(firstNightBelowAllocation(s, null, '18000.00', '2026-11-26', '2026-12-11')).toBeNull()
  })

  it('compares the derived price, not the parent’s', () => {
    const parent = source('20000.00')
    const minus = { kind: 'amount' as const, value: '-5000.00' }
    expect(firstNightBelowAllocation(parent, minus, '18000.00', '2026-11-26', '2026-11-26')).toBe(
      '2026-11-26',
    )
    const plus = { kind: 'amount' as const, value: '18000.00' }
    expect(
      firstNightBelowAllocation(parent, plus, '18000.00', '2026-11-26', '2026-11-30'),
    ).toBeNull()
  })
})

describe('dates for Change dates', () => {
  it('counts the Festive season as 16 nights', () => {
    const dates = selectDates('2026-12-18', '2027-01-02')
    expect(dates).toHaveLength(16)
    expect(dates.at(-1)).toBe('2027-01-02')
  })

  it('keeps only the chosen days of the week', () => {
    expect(selectDates('2026-11-23', '2026-12-06', [5, 6])).toEqual([
      '2026-11-27',
      '2026-11-28',
      '2026-12-04',
      '2026-12-05',
    ])
  })

  it('says which days are missing in the spec’s words', () => {
    expect(selectDates('2026-12-07', '2026-12-10', [5])).toEqual([])
    expect(noDatesMessage('2026-12-07', '2026-12-10', [5])).toBe('No Fridays between 7 and 10 Dec.')
    expect(noDatesMessage('2026-11-30', '2026-12-03', [6, 5])).toBe(
      'No Fridays or Saturdays between 30 Nov and 3 Dec.',
    )
    expect(noDatesMessage('2026-12-29', '2027-01-01', [0, 1, 6])).toBe(
      'No Sundays, Mondays or Saturdays between 29 Dec 2026 and 1 Jan 2027.',
    )
  })

  it('allows dates up to 2 years after the business date, leap days included', () => {
    expect(lastRateDate('2026-11-25')).toBe('2028-11-25')
    expect(addYears('2028-02-29', 2)).toBe('2030-02-28')
    expect(addYears('2028-02-29', 4)).toBe('2032-02-29')
  })

  it('writes dates the way the messages need them', () => {
    expect(formatRateDate('2027-01-12')).toBe('12 Jan 2027')
    expect(formatRateDate('2026-09-05', false)).toBe('5 Sep')
    expect(formatNaira('165000.00')).toBe('₦165,000')
  })
})

describe('quoting a stay', () => {
  const base = {
    adjustment: null,
    planName: 'Best available',
    planMinStay: 1,
    mealAllocation: null,
    baseOccupancy: 2,
    adults: 2,
  }

  it('prices each night and totals them, with no tax lines', () => {
    const quote = quoteNights({
      ...base,
      source: source('150000.00', null, { '2026-12-05': cell({ price: '165000.00' }) }),
      arrival: '2026-12-04',
      departure: '2026-12-07',
    })
    expect(quote.lines.map((line) => [line.date, line.price, line.from])).toEqual([
      ['2026-12-04', '150000.00', 'standard'],
      ['2026-12-05', '165000.00', 'date'],
      ['2026-12-06', '150000.00', 'standard'],
    ])
    expect(quote.total).toBe('465000.00')
    expect(quote.breaks).toEqual([])
  })

  it('charges each adult above base occupancy, and nothing for children', () => {
    const quote = quoteNights({
      ...base,
      adults: 3,
      source: source('320000.00', null, {}, '25000.00'),
      arrival: '2026-12-09',
      departure: '2026-12-11',
    })
    expect(quote.lines[0]).toMatchObject({ extraAdult: '25000.00', total: '345000.00' })
    expect(quote.total).toBe('690000.00')
  })

  it('carries the meal allocation on every night of a meal plan', () => {
    const quote = quoteNights({
      ...base,
      adjustment: { kind: 'amount', value: '18000.00' },
      mealAllocation: '18000.00',
      source: source('150000.00'),
      arrival: '2026-12-09',
      departure: '2026-12-12',
    })
    expect(quote.lines.every((line) => line.mealAllocation === '18000.00')).toBe(true)
    expect(quote.total).toBe('504000.00')
  })

  it('reports closed to arrival, min stay and closed nights with their dates', () => {
    const quote = quoteNights({
      ...base,
      source: source('210000.00', null, {
        '2026-12-02': cell({ closedToArrival: true, minStay: 2 }),
        '2026-12-03': cell({ closed: true }),
      }),
      arrival: '2026-12-02',
      departure: '2026-12-03',
    })
    expect(quote.breaks).toEqual([
      {
        kind: 'closed_to_arrival',
        date: '2026-12-02',
        message: 'Best available is closed to arrivals on 2 Dec 2026.',
      },
      {
        kind: 'min_stay',
        date: '2026-12-02',
        message: 'Best available needs a stay of at least 2 nights from 2 Dec 2026.',
      },
    ])
    const longer = quoteNights({
      ...base,
      source: source('210000.00', null, { '2026-12-03': cell({ closed: true }) }),
      arrival: '2026-12-02',
      departure: '2026-12-05',
    })
    expect(longer.breaks.map((b) => [b.kind, b.date])).toEqual([['closed', '2026-12-03']])
  })
})

describe('foreign equivalents for guests', () => {
  it('shows NGN in dollars at a recorded rate, rounded once', () => {
    expect(
      foreignEquivalent('150000.00', 'USD', {
        rate: '1425',
        source: 'cbn_official',
        date: '2026-11-25',
      }),
    ).toEqual({
      amount: '105.26',
      currency: 'USD',
      label: '≈ $105.26 at ₦1,425/$, CBN, 25 Nov 2026',
    })
  })
})

describe('rate plan form rules', () => {
  const plan = {
    propertyId: '019a0000-0000-7000-8000-000000000001',
    name: 'Bed & breakfast',
    code: 'bb',
    cancellation: { kind: 'free_until', hours: 48, penalty: { kind: 'first_night' } },
    deposit: { kind: 'first_night', due: { kind: 'within_hours', hours: 48 } },
  }
  const roomType = '019a0000-0000-7000-8000-000000000002'

  it('defaults a breakfast plan’s meal allocation to its amount offset', () => {
    const parsed = createRatePlanSchema.parse({
      ...plan,
      pricing: 'derived',
      parentId: '019a0000-0000-7000-8000-000000000003',
      adjustment: { kind: 'amount', value: '18000' },
      roomTypes: [{ roomTypeId: roomType }],
      mealPlan: 'bed_breakfast',
    })
    expect(parsed).toMatchObject({ code: 'BB', mealAllocation: '18000.00', minStay: 1 })
  })

  it('asks for the allocation when it can’t be defaulted, and drops it on room only', () => {
    const percent = createRatePlanSchema.safeParse({
      ...plan,
      pricing: 'derived',
      parentId: '019a0000-0000-7000-8000-000000000003',
      adjustment: { kind: 'percent', value: '10' },
      roomTypes: [{ roomTypeId: roomType }],
      mealPlan: 'half_board',
    })
    expect(percent.error?.issues[0]?.path).toEqual(['mealAllocation'])
    const roomOnly = createRatePlanSchema.parse({
      ...plan,
      pricing: 'own',
      roomTypes: [{ roomTypeId: roomType, weekday: '120000' }],
      mealAllocation: '5000',
    })
    expect(roomOnly.mealAllocation).toBeNull()
  })

  it('needs a weekday price on own-price plans and none on derived plans', () => {
    const own = createRatePlanSchema.safeParse({
      ...plan,
      pricing: 'own',
      roomTypes: [{ roomTypeId: roomType }],
    })
    expect(own.error?.issues[0]?.message).toBe('Enter a weekday price')
    const derived = createRatePlanSchema.safeParse({
      ...plan,
      pricing: 'derived',
      parentId: '019a0000-0000-7000-8000-000000000003',
      adjustment: { kind: 'percent', value: '-10' },
      roomTypes: [{ roomTypeId: roomType, weekday: '1000' }],
    })
    expect(derived.success).toBe(false)
  })

  it('refuses a Change dates apply with nothing to change, or over 366 dates', () => {
    const apply = {
      ratePlanId: roomType,
      batchId: roomType,
      roomTypeIds: [roomType],
      from: '2026-12-18',
      to: '2027-01-02',
    }
    expect(setRateDatesSchema.safeParse(apply).error?.issues[0]?.message).toBe(
      'Choose a price or a restriction to change',
    )
    expect(setRateDatesSchema.safeParse({ ...apply, minStay: 2 }).success).toBe(true)
    expect(
      setRateDatesSchema.safeParse({ ...apply, to: '2027-12-19', minStay: 2 }).error?.issues[0]
        ?.message,
    ).toBe('Up to 366 dates at a time')
    expect(setRateDatesSchema.safeParse({ ...apply, to: '2027-12-18', minStay: 2 }).success).toBe(
      true,
    )
  })
})
