import { describe, expect, it } from 'vitest'
import {
  age,
  answerLine,
  nobodyLine,
  promptMeta,
  promptTitle,
  rowAmount,
  rowLabel,
  rowTitle,
  statusBadge,
  subjectFigures,
  withoutPinLine,
  yourRequestLine,
} from './format'

const SUBJECT = {
  hotelName: 'Kora Victoria Island',
  guestName: 'Sarah Collins',
  roomTypeName: 'Deluxe King',
  planName: 'Bed & breakfast',
  arrival: '2026-12-09',
  departure: '2026-12-12',
  nights: 3,
  planPrice: '168000.00',
  newPrice: '142800.00',
  varies: false,
  percent: '15',
  discountTotal: '75600.00',
  totalBefore: '617400.00',
  totalAfter: '524790.00',
  depositAfter: '174930.00',
  reason: 'repeat_guest' as const,
  reasonText: null,
  note: 'Stayed 4 times this year',
  requesterName: 'Chiamaka Eze',
  requesterLimit: '12',
  requesterRole: 'front desk',
  deviceName: 'FD-VI-01',
}
const TZ = 'Africa/Lagos'
const VIEW = {
  kind: 'stay_discount' as const,
  subject: SUBJECT,
  status: 'pending' as const,
  approver: { memberId: 'm', name: 'Tunde Bello' },
  requestedAt: '2026-11-25T09:36:00.000Z',
  expiresAt: '2026-11-25T10:06:00.000Z',
  answeredAt: null,
  comment: null,
  usedFor: null,
}

describe('the approval prompt', () => {
  it('says what is asked, by whom, and the figures', () => {
    expect(promptTitle(SUBJECT)).toBe('Discount 15% on Deluxe King · Bed & breakfast')
    expect(promptMeta(SUBJECT, new Date(VIEW.requestedAt), TZ)).toBe(
      "Chiamaka's limit is 12%. Asked at 10:36 on FD-VI-01.",
    )
    expect(subjectFigures(SUBJECT).map((f) => `${f.label}: ${f.value}`)).toEqual([
      'Plan price: ₦168,000.00 a night',
      'Discount 15%: − ₦25,200.00 a night',
      'New rate: ₦142,800.00 a night',
      'Stay total incl. taxes: ₦617,400.00 → ₦524,790.00',
    ])
  })
  it('says when nobody can approve', () => {
    expect(nobodyLine(SUBJECT)).toBe(
      'Nobody at Kora Victoria Island can approve 15% right now. Use up to 12%.',
    )
    expect(withoutPinLine(['Tunde Bello'])).toBe(
      "Approvers need a PIN. Tunde Bello hasn't set one yet.",
    )
    expect(withoutPinLine([])).toBeUndefined()
  })
})

describe('inbox rows and Review', () => {
  it('names the kind, the hotel, the guest and the discount over the stay', () => {
    expect(rowLabel(VIEW)).toBe('Over limit · Kora Victoria Island')
    expect(rowTitle(VIEW)).toBe('Discount 15% · Sarah Collins')
    expect(rowAmount(VIEW)).toBe('− ₦75,600.00')
    expect(statusBadge({ status: 'approved', usedFor: 'VI-2611-0484' }).label).toBe(
      'Approved · used for VI-2611-0484',
    )
    expect(statusBadge({ status: 'pending', usedFor: null })).toEqual({
      tone: 'amber',
      label: 'Waiting',
    })
    expect(age('2026-11-25T09:36:00.000Z', new Date('2026-11-25T09:38:30.000Z'))).toBe('2 min')
  })
  it('writes the waiting, approved, declined and expired lines', () => {
    expect(answerLine(VIEW, TZ)).toBe('Waiting for Tunde Bello · asked 10:36 · expires 11:06')
    expect(
      answerLine({ ...VIEW, status: 'approved', answeredAt: '2026-11-25T09:39:00.000Z' }, TZ),
    ).toBe('Approved by Tunde Bello at 10:39')
    expect(answerLine({ ...VIEW, status: 'declined', comment: 'Max 12% this week' }, TZ)).toBe(
      'Tunde Bello declined 15%: “Max 12% this week”',
    )
    expect(answerLine({ ...VIEW, status: 'expired' }, TZ)).toBe(
      "Tunde didn't answer by 11:06. Ask again or change the discount.",
    )
    expect(yourRequestLine({ ...VIEW, status: 'approved' })).toBe(
      'Tunde approved 15% for Sarah Collins',
    )
  })
})
