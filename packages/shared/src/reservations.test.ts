import { describe, expect, it } from 'vitest'
import { dec, toAmount } from './money.ts'
import {
  applyDiscount,
  cancellationTerms,
  depositDue,
  discountInputSchema,
  discountProblemMessage,
  nationalityCurrency,
  nightTaxes,
  overLimit,
  overLimitMessage,
  periodOf,
  reservationNumber,
  stayTotals,
  suggestBookingPrefix,
} from './reservations.ts'
import type { TaxRuleInForce } from './taxes.ts'

// The seed's illustrative Lagos rates (to verify against current law): service charge 10%, VAT
// 7.5%, Lagos consumption tax 5%, all on the net, on rooms and food.
const rule = (kind: TaxRuleInForce['kind'], name: string, ratePercent: string): TaxRuleInForce => ({
  taxId: `019a0000-0000-7000-8000-00000000000${kind === 'service_charge' ? 1 : kind === 'vat' ? 2 : 3}`,
  rateId: '019a0000-0000-7000-8000-000000000010',
  kind,
  name,
  ratePercent,
  categories: ['accommodation', 'food'],
  base: 'net',
})
const LAGOS = [
  rule('vat', 'VAT', '7.5'),
  rule('state_tax', 'Lagos consumption tax', '5'),
  rule('service_charge', 'Service charge', '10'),
]
const HOTEL = { checkInTime: '14:00', timeZone: 'Africa/Lagos' }
const BB_NIGHTS = ['2026-12-09', '2026-12-10', '2026-12-11'].map((date) => ({
  date,
  planPrice: '168000.00',
  extraAdult: '0.00',
  mealAllocation: '18000.00',
}))

function price(discount: Parameters<typeof applyDiscount>[1]) {
  const result = applyDiscount(BB_NIGHTS, discount)
  if (!result.ok) throw new Error(result.problem)
  const taxes = result.nights.map((night) => nightTaxes(night, LAGOS, false))
  return { result, taxes, totals: stayTotals(taxes) }
}

describe('the walkthrough booking (Bed & breakfast, Deluxe King, 9–12 Dec)', () => {
  it('totals ₦617,400.00 with the lines in bill order', () => {
    const { totals, taxes } = price(null)
    expect(totals.total).toBe('617400.00')
    expect(totals.net).toBe('504000.00')
    expect(totals.lines.map((line) => [line.name, line.amount])).toEqual([
      ['Service charge', '50400.00'],
      ['VAT', '37800.00'],
      ['Lagos consumption tax', '25200.00'],
    ])
    expect(taxes[0]?.gross).toBe('205800.00')
  })

  it('asks the first night as deposit within 48 hours, and frees cancellation until 48 hours before check-in', () => {
    const bookedAt = new Date('2026-11-25T09:32:00Z')
    const stay = { arrival: '2026-12-09', firstNightGross: '205800.00', total: '617400.00' }
    const deposit = depositDue(
      { kind: 'first_night', due: { kind: 'within_hours', hours: 48 } },
      stay,
      bookedAt,
      HOTEL,
    )
    expect(deposit?.amount).toBe('205800.00')
    expect(deposit?.dueAt.toISOString()).toBe('2026-11-27T09:32:00.000Z')
    const terms = cancellationTerms(
      { kind: 'free_until', hours: 48, penalty: { kind: 'first_night' } },
      stay,
      HOTEL,
    )
    expect(terms).toMatchObject({ kind: 'free_until', penalty: '205800.00' })
    if (terms.kind === 'free_until') {
      expect(terms.deadline.toISOString()).toBe('2026-12-07T13:00:00.000Z')
    }
  })

  it('takes 10% off the room price on every night', () => {
    const { result, totals } = price({ kind: 'percent', value: '10' })
    expect(result.nights.map((night) => night.soldPrice)).toEqual([
      '151200.00',
      '151200.00',
      '151200.00',
    ])
    expect(totals.total).toBe('555660.00')
    expect(dec(totals.total).dividedBy(3).toFixed(2)).toBe('185220.00')
  })

  it('measures a typed rate per night against the plan price', () => {
    const { result } = price({ kind: 'rate', value: '151200.00' })
    if (result.ok) expect(result.percent.toString()).toBe('10')
  })

  it('refuses a rate above the plan, a free night, and a rate below breakfast', () => {
    expect(applyDiscount(BB_NIGHTS, { kind: 'rate', value: '170000.00' })).toMatchObject({
      ok: false,
      problem: 'ABOVE_PLAN',
    })
    expect(applyDiscount(BB_NIGHTS, { kind: 'rate', value: '0.00' })).toMatchObject({
      ok: false,
      problem: 'ZERO',
    })
    expect(applyDiscount(BB_NIGHTS, { kind: 'rate', value: '17000.00' })).toMatchObject({
      ok: false,
      problem: 'BELOW_MEAL',
    })
    expect(
      discountProblemMessage('BELOW_MEAL', {
        name: 'Bed & breakfast',
        mealPlan: 'bed_breakfast',
        mealAllocation: '18000.00',
      }),
    ).toBe("Bed & breakfast's breakfast part is ₦18,000.00 a night, so the rate can't go below it.")
  })

  it('leaves the extra adult charge alone', () => {
    const result = applyDiscount(
      [{ ...BB_NIGHTS[0], date: '2026-12-09', extraAdult: '25000.00' } as never],
      {
        kind: 'percent',
        value: '10',
      },
    )
    expect(result.ok && result.nights[0]).toMatchObject({
      soldPrice: '151200.00',
      extraAdult: '25000.00',
    })
  })
})

describe('the discount limit', () => {
  it('allows up to the limit and refuses a kobo over', () => {
    expect(overLimit('12', '12.00')).toBe(false)
    expect(overLimit('12.01', '12.00')).toBe(true)
    expect(overLimit('80', null)).toBe(false)
    expect(overLimitMessage('15', '12.00')).toBe(
      '15% is over your 12% discount limit. Use up to 12%, or ask a manager with a higher limit to make this booking.',
    )
  })

  it('needs a reason, and words for Other', () => {
    expect(
      discountInputSchema.safeParse({ kind: 'percent', value: '10', reason: 'other' }).success,
    ).toBe(false)
    expect(
      discountInputSchema.parse({ kind: 'rate', value: '151,200', reason: 'long_stay' }).value,
    ).toBe('151200.00')
    expect(
      discountInputSchema.safeParse({ kind: 'percent', value: '100', reason: 'long_stay' }).success,
    ).toBe(false)
  })
})

describe('inclusive plans', () => {
  it('back the net out of the price and keep every kobo', () => {
    const taxes = nightTaxes(
      { soldPrice: '150000.00', extraAdult: '0.00', mealAllocation: '0.00' },
      LAGOS,
      true,
    )
    expect(taxes.gross).toBe('150000.00')
    const lines = [...taxes.room.lines].reduce((sum, line) => sum.plus(line.amount), dec('0'))
    expect(dec(taxes.net).plus(lines).plus(taxes.rounding).toFixed(2)).toBe('150000.00')
  })
})

// A small deterministic generator in place of a property-testing library.
function random(seed: number) {
  let state = seed
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648
  }
}

describe('totals add up to the kobo (property)', () => {
  it('total = Σ nights and net + lines + rounding = total, for 500 random stays', () => {
    const next = random(42)
    for (let run = 0; run < 500; run++) {
      const count = 1 + Math.floor(next() * 20)
      const inclusive = next() > 0.5
      const nights = Array.from({ length: count }, (_, i) => ({
        soldPrice: toAmount(
          String(10_000 + Math.floor(next() * 900_000) + (next() > 0.7 ? 0.37 : 0)),
        ),
        extraAdult: next() > 0.8 ? '15000.00' : '0.00',
        mealAllocation: next() > 0.5 ? '18000.00' : '0.00',
        date: `2027-01-${String(i + 1).padStart(2, '0')}`,
      }))
      const taxes = nights.map((night) => nightTaxes(night, LAGOS, inclusive))
      const totals = stayTotals(taxes)
      const sumGross = taxes.reduce((sum, night) => sum.plus(night.gross), dec('0'))
      expect(totals.total).toBe(toAmount(sumGross))
      const lines = totals.lines.reduce((sum, line) => sum.plus(line.amount), dec('0'))
      expect(toAmount(dec(totals.net).plus(lines).plus(totals.rounding))).toBe(totals.total)
    }
  })
})

describe('deposit timing', () => {
  it('is due by check-in on the arrival day when that comes sooner', () => {
    const due = depositDue(
      { kind: 'full_stay', due: { kind: 'within_hours', hours: 48 } },
      { arrival: '2026-11-26', firstNightGross: '1.00', total: '2.00' },
      new Date('2026-11-25T09:32:00Z'),
      HOTEL,
    )
    expect(due?.dueAt.toISOString()).toBe('2026-11-26T13:00:00.000Z')
    expect(due?.amount).toBe('2.00')
  })
  it('rounds a percentage once, half-up', () => {
    const due = depositDue(
      { kind: 'percent_of_stay', percent: '33.33', due: { kind: 'at_booking' } },
      { arrival: '2026-12-09', firstNightGross: '1.00', total: '617400.00' },
      new Date('2026-11-25T09:32:00Z'),
      HOTEL,
    )
    expect(due?.amount).toBe('205779.42')
  })
})

describe('numbers, prefixes and currencies', () => {
  it('builds VI-2611-0483', () => {
    expect(reservationNumber('VI', periodOf('2026-11-25'), 483)).toBe('VI-2611-0483')
  })
  it('suggests a prefix from the distinctive part of the name', () => {
    expect(suggestBookingPrefix('Kora Lekki', [])).toBe('LEK')
    expect(suggestBookingPrefix('Kora Lekki Phase 1', ['LEK'])).toBe('LEKA')
    expect(suggestBookingPrefix('Sheraton', [])).toBe('SHE')
  })
  it('shows British guests pounds, euro-area guests euros and everyone else dollars', () => {
    expect(nationalityCurrency('GB')).toBe('GBP')
    expect(nationalityCurrency('DE')).toBe('EUR')
    expect(nationalityCurrency('GH')).toBe('USD')
    expect(nationalityCurrency('NG')).toBeNull()
  })
})
