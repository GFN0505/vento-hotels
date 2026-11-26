import { describe, expect, it } from 'vitest'
import { dec, toAmount } from './money.ts'
import {
  orderTaxRules,
  type TaxCategory,
  type TaxRuleInForce,
  taxLines,
  taxRateStatus,
  versionInForce,
} from './taxes.ts'

const id = (n: number) => `0190f0f0-0000-7000-8000-${String(n).padStart(12, '0')}`

// The demo hotel's rules (illustrative rates, To verify): service charge, VAT, Lagos consumption tax.
const serviceCharge: TaxRuleInForce = {
  taxId: id(1),
  rateId: id(11),
  kind: 'service_charge',
  name: 'Service charge',
  ratePercent: '10',
  categories: ['accommodation', 'food', 'beverage', 'events'],
  base: 'net',
}
const vat: TaxRuleInForce = {
  taxId: id(2),
  rateId: id(12),
  kind: 'vat',
  name: 'VAT',
  ratePercent: '7.5',
  categories: ['accommodation', 'food', 'beverage', 'events', 'laundry', 'other'],
  base: 'net',
}
const lagos: TaxRuleInForce = {
  taxId: id(3),
  rateId: id(13),
  kind: 'state_tax',
  name: 'Lagos consumption tax',
  ratePercent: '5',
  categories: ['accommodation', 'food', 'beverage', 'events'],
  base: 'net',
}
const rules = [serviceCharge, vat, lagos]

const amounts = (breakdown: ReturnType<typeof taxLines>) =>
  breakdown.lines.map((line) => [line.name, line.base, line.amount])

describe('taxLines, exclusive prices', () => {
  it('adds service charge, VAT and consumption tax on the net, as on the walkthrough bill', () => {
    const bill = taxLines({
      amount: '150000',
      currency: 'NGN',
      pricing: 'exclusive',
      category: 'accommodation',
      rules,
    })
    expect(amounts(bill)).toEqual([
      ['Service charge', '150000.00', '15000.00'],
      ['VAT', '150000.00', '11250.00'],
      ['Lagos consumption tax', '150000.00', '7500.00'],
    ])
    expect(bill).toMatchObject({ net: '150000.00', rounding: '0.00', gross: '183750.00' })
  })

  it('rounds each line once, half-up, to the kobo', () => {
    const bill = taxLines({
      amount: '1234.50',
      currency: 'NGN',
      pricing: 'exclusive',
      category: 'food',
      rules,
    })
    // 123.45, 92.5875 → 92.59, 61.725 → 61.73
    expect(bill.lines.map((line) => line.amount)).toEqual(['123.45', '92.59', '61.73'])
    expect(bill.gross).toBe('1512.27')
  })

  it('calculates a tax on the charge plus service charge when its rule says so', () => {
    const bill = taxLines({
      amount: '150000',
      currency: 'NGN',
      pricing: 'exclusive',
      category: 'accommodation',
      rules: [serviceCharge, { ...vat, base: 'net_plus_service_charge' }, lagos],
    })
    expect(amounts(bill)[1]).toEqual(['VAT', '165000.00', '12375.00'])
    expect(bill.gross).toBe('184875.00')
  })

  it('always lists service charge, then VAT, then state taxes, whatever order the rules come in', () => {
    const levy = { ...lagos, taxId: id(4), rateId: id(14), name: 'Lagos levy', ratePercent: '1' }
    const bill = taxLines({
      amount: '1000',
      currency: 'NGN',
      pricing: 'exclusive',
      category: 'food',
      rules: [lagos, levy, vat, serviceCharge],
    })
    expect(bill.lines.map((line) => line.name)).toEqual([
      'Service charge',
      'VAT',
      'Lagos consumption tax',
      'Lagos levy',
    ])
    expect(orderTaxRules([lagos, vat]).map((rule) => rule.kind)).toEqual(['vat', 'state_tax'])
  })

  it('gives a category only the taxes whose rate covers it', () => {
    const bill = taxLines({
      amount: '5000',
      currency: 'NGN',
      pricing: 'exclusive',
      category: 'laundry',
      rules,
    })
    expect(amounts(bill)).toEqual([['VAT', '5000.00', '375.00']])
  })

  it('gives exempt charges, and charges with no rule, no lines at all', () => {
    for (const category of ['exempt', 'other'] as TaxCategory[]) {
      const bill = taxLines({
        amount: '5000',
        currency: 'NGN',
        pricing: 'inclusive',
        category,
        rules: [serviceCharge, lagos],
      })
      expect(bill).toMatchObject({ lines: [], net: '5000.00', rounding: '0.00', gross: '5000.00' })
    }
  })
})

describe('taxLines, inclusive prices', () => {
  it('backs the net out of ₦5,000.00 and puts the kobo left over on one rounding line', () => {
    const bill = taxLines({
      amount: '5000',
      currency: 'NGN',
      pricing: 'inclusive',
      category: 'food',
      rules,
    })
    expect(bill.net).toBe('4081.63')
    expect(bill.lines.map((line) => line.amount)).toEqual(['408.16', '306.12', '204.08'])
    expect(bill.rounding).toBe('0.01')
    expect(bill.gross).toBe('5000.00')
  })

  it('adds up exactly when a tax is on the charge plus service charge', () => {
    const bill = taxLines({
      amount: '183750',
      currency: 'NGN',
      pricing: 'inclusive',
      category: 'accommodation',
      rules: [serviceCharge, { ...vat, base: 'net_plus_service_charge' }, lagos],
    })
    const total = bill.lines.reduce((sum, line) => sum.plus(line.amount), dec(bill.net))
    expect(toAmount(total.plus(bill.rounding))).toBe('183750.00')
  })

  it('mirrors a negative amount exactly, so a refund breaks down like the charge', () => {
    const plus = taxLines({
      amount: '5000',
      currency: 'NGN',
      pricing: 'inclusive',
      category: 'food',
      rules,
    })
    const minus = taxLines({
      amount: '-5000',
      currency: 'NGN',
      pricing: 'inclusive',
      category: 'food',
      rules,
    })
    expect(minus.net).toBe(toAmount(dec(plus.net).negated()))
    expect(minus.rounding).toBe(toAmount(dec(plus.rounding).negated()))
    expect(minus.lines.map((line) => line.amount)).toEqual(
      plus.lines.map((line) => toAmount(dec(line.amount).negated())),
    )
  })
})

// A small seeded generator, so the property tests are repeatable.
function random(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('taxLines, properties over many prices and rates', () => {
  const next = random(20261126)
  const rate = () => toAmount(dec(String(Math.floor(next() * 3000) + 1)).dividedBy(100)) // 0.01–30.00
  const cases = Array.from({ length: 3000 }, () => {
    const kobo = Math.floor(next() * 100_000_000) // up to ₦1,000,000.00
    const base = (): TaxRuleInForce['base'] => (next() < 0.3 ? 'net_plus_service_charge' : 'net')
    const all: TaxRuleInForce[] = [
      { ...serviceCharge, ratePercent: rate() },
      { ...vat, ratePercent: rate(), base: base() },
      { ...lagos, ratePercent: rate(), base: base() },
    ]
    const set = all.filter(() => next() < 0.85)
    return { amount: toAmount(dec(String(kobo)).dividedBy(100)), rules: set }
  })

  it('inclusive lines, net and rounding always add up to the price, to the kobo', () => {
    for (const { amount, rules: set } of cases) {
      const bill = taxLines({
        amount,
        currency: 'NGN',
        pricing: 'inclusive',
        category: 'food',
        rules: set,
      })
      const sum = bill.lines.reduce((total, line) => total.plus(line.amount), dec(bill.net))
      expect(toAmount(sum.plus(bill.rounding))).toBe(amount)
      // Only a few kobo, never a tax's worth.
      expect(dec(bill.rounding).abs().lessThanOrEqualTo('0.05')).toBe(true)
    }
  })

  it('exclusive totals always equal the price plus the lines, with no rounding line', () => {
    for (const { amount, rules: set } of cases) {
      const bill = taxLines({
        amount,
        currency: 'NGN',
        pricing: 'exclusive',
        category: 'food',
        rules: set,
      })
      const sum = bill.lines.reduce((total, line) => total.plus(line.amount), dec(amount))
      expect(bill.gross).toBe(toAmount(sum))
      expect(bill.rounding).toBe('0.00')
      for (const line of bill.lines) {
        expect(line.amount).toBe(toAmount(dec(line.base).times(line.ratePercent).dividedBy(100)))
      }
    }
  })
})

describe('rate versions', () => {
  const versions = [
    { effectiveFrom: '2020-02-01', stop: false, ratePercent: '7.5' },
    { effectiveFrom: '2007-01-01', stop: false, ratePercent: '5' },
    { effectiveFrom: '2027-01-01', stop: false, ratePercent: '8' },
  ]

  it('uses the latest version that started on or before the date', () => {
    expect(versionInForce(versions, '2026-11-25')?.ratePercent).toBe('7.5')
    expect(versionInForce(versions, '2020-01-31')?.ratePercent).toBe('5')
    expect(versionInForce(versions, '2027-01-01')?.ratePercent).toBe('8')
    expect(versionInForce(versions, '2006-12-31')).toBeUndefined()
  })

  it('charges nothing from a stop on', () => {
    const stopped = [...versions, { effectiveFrom: '2027-06-01', stop: true, ratePercent: '0' }]
    expect(versionInForce(stopped, '2027-05-31')?.ratePercent).toBe('8')
    expect(versionInForce(stopped, '2027-06-01')).toBeUndefined()
  })

  it('names each version scheduled, current, past or stopped against the business date', () => {
    const date = '2026-11-25'
    expect(versions.map((v) => taxRateStatus(v, versions, date))).toEqual([
      'current',
      'past',
      'scheduled',
    ])
    const stop = { effectiveFrom: '2026-01-01', stop: true }
    expect(taxRateStatus(stop, [...versions, stop], date)).toBe('stopped')
  })
})
