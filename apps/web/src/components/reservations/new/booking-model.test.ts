import { describe, expect, it } from 'vitest'
import { EMPTY_GUEST, newDraft } from './booking-draft'
import {
  createInput,
  datesProblems,
  discountProblems,
  guestProblems,
  percentFromRate,
  rateFromPercent,
  stepFor,
} from './booking-model'

const QUOTE = {
  terms: {
    planName: 'Bed & breakfast',
    planCode: 'BB',
    mealPlan: 'bed_breakfast' as const,
    mealAllocation: '18000.00',
    cancellation: { kind: 'non_refundable' as const },
    deposit: { kind: 'none' as const },
    pricesIncludeTaxes: false,
  },
  nights: ['2026-12-09', '2026-12-10', '2026-12-11'].map((date) => ({
    date,
    planPrice: '168000.00',
    soldPrice: '168000.00',
    extraAdult: '0.00',
    mealAllocation: '18000.00',
    net: '168000.00',
    lines: [],
    rounding: '0.00',
    gross: '205800.00',
  })),
}
const FRONT_DESK = { canDiscount: true, discountLimit: '12.00' }
const discount = (value: string, extra = {}) => ({
  kind: 'percent' as const,
  value,
  reason: 'repeat_guest' as const,
  reasonText: '',
  note: '',
  ...extra,
})

describe('dates and guests', () => {
  it('asks which hotel under All hotels and keeps arrivals on or after the business date', () => {
    const draft = { ...newDraft('all', undefined, '2026-11-24', '2026-11-24') }
    expect(datesProblems(draft, '2026-11-25', true)).toEqual({
      hotel: 'Which hotel?',
      arrival: 'Pick a date from the business date on',
      departure: 'Departure must be after arrival',
    })
  })
})

describe('the discount on the device', () => {
  it('shows the limit message over 12% and accepts 10% with a reason', () => {
    expect(discountProblems(discount('15'), QUOTE, FRONT_DESK).value).toBe(
      '15% is over your 12% discount limit. Use up to 12%, or ask a manager with a higher limit to make this booking.',
    )
    expect(discountProblems(discount('10'), QUOTE, FRONT_DESK)).toEqual({})
    expect(discountProblems(discount('10', { reason: undefined }), QUOTE, FRONT_DESK).reason).toBe(
      'Pick a reason',
    )
  })
  it('refuses a rate below the breakfast part', () => {
    expect(
      discountProblems({ ...discount('17000'), kind: 'rate' }, QUOTE, {
        ...FRONT_DESK,
        discountLimit: null,
      }).value,
    ).toBe("Bed & breakfast's breakfast part is ₦18,000.00 a night, so the rate can't go below it.")
  })
  it('links the discount and the rate per night', () => {
    expect(rateFromPercent('10', '168000.00')).toBe('151200.00')
    expect(percentFromRate('151,200', '168000.00')).toBe('10')
  })
})

describe('the guest', () => {
  it('needs a phone or an email', () => {
    expect(guestProblems({ ...EMPTY_GUEST, firstName: 'Sarah', lastName: 'Collins' }).phone).toBe(
      'Enter a phone number or an email, so the hotel can reach the guest.',
    )
  })
})

describe('booking', () => {
  it('sends one stay with the quoted hash, the discount and a new guest', () => {
    const draft = {
      ...newDraft('h', 'h', '2026-12-09', '2026-12-12'),
      adults: 1,
      roomTypeId: 'type',
      ratePlanId: 'plan',
      discount: discount('10'),
      guest: {
        ...EMPTY_GUEST,
        firstName: 'Sarah',
        lastName: 'Collins',
        phone: '+44 7700 900123',
        nationality: 'GB',
      },
    }
    const input = createInput(draft, 'hotel', { quoteHash: 'abc', breaks: [] })
    expect(input.guest).toMatchObject({ kind: 'new', fields: { firstName: 'Sarah' } })
    expect(input.stays[0]).toMatchObject({ quoteHash: 'abc', adults: 1, discount: { value: '10' } })
    expect(input.idempotencyKey).toBe(draft.key)
  })
  it('sends a refusal back to the step it belongs to', () => {
    expect(stepFor('SOLD_OUT')).toBe(2)
    expect(stepFor('PAST_DATE')).toBe(1)
    expect(stepFor('PRICE_CHANGED')).toBe(4)
  })
})
