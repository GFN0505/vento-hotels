import { describe, expect, it } from 'vitest'
import { EMPTY_GUEST, newDraft } from './booking-draft'
import {
  approvalStale,
  approvalState,
  createInput,
  datesProblems,
  discountProblems,
  draftFromRequest,
  guestProblems,
  overLimitNotice,
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
  it('lets 15% go on to approval with an amber note, and accepts 10% with a reason', () => {
    expect(discountProblems(discount('15'), QUOTE, FRONT_DESK)).toEqual({})
    expect(
      overLimitNotice(
        discount('15'),
        { discount: { percent: '15', limit: '12.00', within: false } },
        FRONT_DESK,
      ),
    ).toBe(
      '15% is over your 12% discount limit. A manager with a higher limit can approve it when you book.',
    )
    expect(
      overLimitNotice(
        discount('10'),
        { discount: { percent: '10', limit: '12.00', within: true } },
        FRONT_DESK,
      ),
    ).toBeUndefined()
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
  it('sends an approval only for the price it was given for', () => {
    const draft = {
      ...newDraft('h', 'h', '2026-12-09', '2026-12-12'),
      roomTypeId: 'type',
      ratePlanId: 'plan',
      discount: discount('15'),
      approval: { ...APPROVAL, status: 'approved' as const },
    }
    expect(createInput(draft, 'hotel', { quoteHash: 'abc', breaks: [] }).stays[0]?.approvalId).toBe(
      'appr',
    )
    expect(
      createInput(draft, 'hotel', { quoteHash: 'other', breaks: [] }).stays[0]?.approvalId,
    ).toBeUndefined()
  })
  it('sends a refusal back to the step it belongs to', () => {
    expect(stepFor('SOLD_OUT')).toBe(2)
    expect(stepFor('PAST_DATE')).toBe(1)
    expect(stepFor('PRICE_CHANGED')).toBe(4)
  })
})

const APPROVAL = {
  id: 'appr',
  quoteHash: 'abc',
  status: 'pending' as const,
  approverName: 'Tunde Bello',
  requestedAt: '2026-11-25T09:36:00.000Z',
  expiresAt: '2026-11-25T10:06:00.000Z',
  answeredAt: null,
  comment: null,
}
const OVER = { quoteHash: 'abc', discount: { percent: '15', limit: '12.00', within: false } }

describe('approval on Review & book', () => {
  it('maps the quote and the answer to what Review shows', () => {
    expect(approvalState({ quoteHash: 'abc', discount: null }, undefined)).toBe('none')
    expect(approvalState(OVER, undefined)).toBe('over_limit')
    expect(approvalState(OVER, APPROVAL)).toBe('waiting')
    expect(approvalState(OVER, { ...APPROVAL, status: 'approved' })).toBe('approved')
    expect(approvalState(OVER, { ...APPROVAL, status: 'declined' })).toBe('declined')
    expect(approvalState(OVER, { ...APPROVAL, status: 'expired' })).toBe('expired')
    expect(approvalState(OVER, { ...APPROVAL, status: 'cancelled' })).toBe('over_limit')
  })
  it('drops an approval once anything that changes the price moves', () => {
    expect(approvalState({ ...OVER, quoteHash: 'new' }, { ...APPROVAL, status: 'approved' })).toBe(
      'over_limit',
    )
    expect(approvalStale(APPROVAL, 'new')).toBe(true)
    expect(approvalStale(APPROVAL, 'abc')).toBe(false)
    expect(approvalStale(undefined, 'abc')).toBe(false)
  })
  it('resumes the booking at Review from the request', () => {
    const draft = draftFromRequest(
      {
        id: 'appr',
        kind: 'stay_discount',
        propertyId: 'hotel',
        status: 'approved',
        method: 'inbox',
        value: '15',
        subject: { guestName: 'Sarah Collins' } as never,
        requester: { memberId: 'm1', name: 'Chiamaka Eze' },
        approver: { memberId: 'm2', name: 'Tunde Bello' },
        comment: null,
        requestedAt: APPROVAL.requestedAt,
        expiresAt: APPROVAL.expiresAt,
        answeredAt: APPROVAL.requestedAt,
        usedAt: null,
        usedFor: null,
        role: 'requester',
        hotelArchived: false,
        timeZone: 'Africa/Lagos',
        draft: {
          idempotencyKey: 'key',
          propertyId: 'hotel',
          guest: {
            kind: 'new',
            fields: {
              firstName: 'Sarah',
              lastName: 'Collins',
              phone: '+447700900123',
              nationality: 'GB',
            },
          },
          source: 'phone',
          stays: [
            {
              roomTypeId: 'type',
              ratePlanId: 'plan',
              arrival: '2026-12-09',
              departure: '2026-12-12',
              adults: 1,
              children: 0,
              quoteHash: 'abc',
              discount: { kind: 'percent', value: '15', reason: 'repeat_guest' },
            },
          ],
        },
      } as never,
      'hotel',
    )
    expect(draft).toMatchObject({
      key: 'key',
      step: 4,
      discount: { value: '15', reason: 'repeat_guest' },
      guest: { firstName: 'Sarah', phone: '+447700900123' },
      approval: { id: 'appr', status: 'approved', quoteHash: 'abc', approverName: 'Tunde Bello' },
    })
  })
})
