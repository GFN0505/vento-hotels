import type { ReservationDetail } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { clockWords, confirmationText } from './confirmation'
import {
  cancellationLine,
  cancellingNowLine,
  datesSummary,
  depositShort,
  stayRange,
} from './format'

const ID = '019a0000-0000-7000-8000-000000000001'

function detail(overrides: Partial<ReservationDetail> = {}): ReservationDetail {
  return {
    id: ID,
    number: 'VI-2611-0483',
    status: 'confirmed',
    source: 'phone',
    guarantee: 'deposit',
    notes: null,
    quotedTotal: '617400.00',
    depositDue: { amount: '205800.00', dueAt: '2026-11-27T09:32:00.000Z' },
    bookedAt: '2026-11-25T09:32:00.000Z',
    bookedOnBusinessDate: '2026-11-25',
    bookedByName: 'Chiamaka Eze',
    property: {
      id: ID,
      name: 'Kora Victoria Island',
      address: 'Plot 1412 Ahmadu Bello Way, Victoria Island',
      checkInTime: '14:00',
      timeZone: 'Africa/Lagos',
      businessDate: '2026-11-25',
      archived: false,
    },
    guest: {
      id: ID,
      title: 'Ms',
      firstName: 'Sarah',
      lastName: 'Collins',
      phone: '+447700900123',
      email: null,
      nationality: 'GB',
    },
    stays: [
      {
        id: ID,
        roomTypeName: 'Deluxe King',
        arrival: '2026-12-09',
        departure: '2026-12-12',
        adults: 1,
        children: 0,
        terms: {
          planName: 'Bed & breakfast',
          planCode: 'BB',
          mealPlan: 'bed_breakfast',
          mealAllocation: '18000.00',
          cancellation: { kind: 'free_until', hours: 48, penalty: { kind: 'first_night' } },
          deposit: { kind: 'first_night', due: { kind: 'within_hours', hours: 48 } },
          pricesIncludeTaxes: false,
        },
        cancellation: {
          kind: 'free_until',
          deadline: '2026-12-07T13:00:00.000Z',
          penalty: '205800.00',
          penaltyKind: 'first_night',
          percent: null,
        },
        discount: null,
        restrictionOverride: null,
        nights: [],
        totals: { net: '0', lines: [], rounding: '0', total: '617400.00' },
      },
    ],
    taxesSetUp: true,
    transferAccount: {
      bankName: 'Zenith Bank',
      accountNumber: '0123454471',
      accountName: 'Kora Hospitality Ltd',
    },
    activity: [],
    canAudit: true,
    ...overrides,
  }
}

describe('the copied confirmation', () => {
  it('reads as the spec’s WhatsApp message', () => {
    expect(confirmationText(detail()).text).toBe(
      'Kora Victoria Island: Hello Sarah, your booking is confirmed. Deluxe King, Bed & breakfast, 9–12 Dec 2026 · 3 nights, ₦617,400.00 incl. taxes. Confirmation VI-2611-0483. To guarantee your room, please pay a deposit of ₦205,800.00 by 27 Nov 2026 to Zenith Bank 0123454471 (Kora Hospitality Ltd) with reference VI-2611-0483. Free cancellation until 7 Dec 2026, 14:00. Check-in from 2pm at Plot 1412 Ahmadu Bello Way, Victoria Island.',
    )
  })

  it('leaves the deposit out when none is due', () => {
    const text = confirmationText(detail({ depositDue: null })).text
    expect(text).not.toMatch(/deposit/)
  })

  it('asks for payment in full on a non-refundable plan', () => {
    const base = detail()
    const stay = base.stays[0]
    if (!stay) throw new Error('no stay')
    const result = confirmationText({
      ...base,
      depositDue: { amount: '496125.00', dueAt: base.bookedAt },
      stays: [
        {
          ...stay,
          terms: {
            ...stay.terms,
            cancellation: { kind: 'non_refundable' },
            deposit: { kind: 'full_stay', due: { kind: 'at_booking' } },
          },
          cancellation: { kind: 'non_refundable', penalty: '496125.00' },
        },
      ],
    })
    expect(result.text).toContain('Paid in full at booking: please pay ₦496,125.00 to Zenith Bank')
    expect(result.text).toContain('This booking is non-refundable.')
  })

  it('says the hotel will send payment details when it has no transfer account', () => {
    const result = confirmationText(detail({ transferAccount: null }))
    expect(result.noTransferAccount).toBe(true)
    expect(result.text).toContain('by 27 Nov 2026. The hotel will send payment details.')
  })
})

describe('reservation formats', () => {
  it('writes stays, deposits and cancellation the way the spec does', () => {
    expect(stayRange('2026-12-09', '2026-12-12')).toBe('9–12 Dec 2026')
    expect(stayRange('2026-11-28', '2026-12-02')).toBe('28 Nov–2 Dec 2026')
    expect(stayRange('2026-12-30', '2027-01-02')).toBe('30 Dec 2026–2 Jan 2027')
    expect(datesSummary('2026-12-09', '2026-12-12', 1, 0)).toBe(
      'Wed 9 Dec → Sat 12 Dec 2026 · 3 nights · 1 adult',
    )
    const before = new Date('2026-11-25T12:00:00Z')
    expect(
      depositShort(
        { amount: '205800.00', dueAt: '2026-11-27T09:32:00.000Z' },
        'Africa/Lagos',
        before,
      ),
    ).toBe('₦205,800.00 due 27 Nov')
    expect(
      depositShort(
        { amount: '205800.00', dueAt: '2026-11-27T09:32:00.000Z' },
        'Africa/Lagos',
        new Date('2026-11-28T00:00:00Z'),
      ),
    ).toBe('₦205,800.00 overdue')
    const stay = detail().stays[0]
    if (stay) {
      expect(cancellationLine(stay.cancellation, 'Africa/Lagos')).toBe(
        'Free until Mon 7 Dec 2026, 14:00. After that, or no-show: first night, ₦205,800.00.',
      )
    }
    expect(clockWords('14:00')).toBe('2pm')
    expect(clockWords('13:30')).toBe('1:30pm')
  })
})

describe('cancelling now', () => {
  const c = {
    kind: 'free_until' as const,
    deadline: '2026-12-07T13:00:00.000Z',
    penalty: '205800.00',
    penaltyKind: 'first_night' as const,
    percent: null,
  }
  it('is free until the deadline', () => {
    expect(cancellingNowLine(c, 'Africa/Lagos', new Date('2026-12-01T00:00:00Z'))).toBe(
      'Cancelling now is free until 7 Dec 2026, 14:00. After that: first night, ₦205,800.00.',
    )
  })
  it('says the free window ended once it has passed', () => {
    expect(cancellingNowLine(c, 'Africa/Lagos', new Date('2026-12-07T13:00:00Z'))).toBe(
      'Free cancellation ended 7 Dec 2026, 14:00. Cancelling now charges first night, ₦205,800.00.',
    )
  })
})
