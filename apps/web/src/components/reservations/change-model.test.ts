import type { ChangeQuote, EndQuote, PenaltyView, ReservationDetail } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import {
  availabilityLine,
  cancellationText,
  endBanner,
  endButton,
  endSubtitle,
  lateChangeLine,
  newNightLine,
  penaltyState,
  releasedLine,
  saveState,
  waiverNeedsLine,
} from './change-model'

const ID = '019a0000-0000-7000-8000-000000000001'
const TZ = 'Africa/Lagos'

function quote(overrides: Partial<ChangeQuote> = {}): ChangeQuote {
  return {
    room: null,
    roomBefore: null,
    keptPrice: null,
    changeHash: 'h',
    changed: true,
    reservationId: ID,
    number: 'VI-2611-0483',
    stayId: ID,
    version: 1,
    guestName: 'Sarah Collins',
    planName: 'Bed & breakfast',
    roomTypeId: ID,
    roomTypeName: 'Deluxe King',
    nightsBefore: 3,
    nights: [],
    totals: { net: '0', lines: [], rounding: '0', total: '823200.00' },
    before: { total: '617400.00', deposit: null, deadline: null, penalty: '205800.00' },
    after: { deposit: null, depositChanged: false, deadline: null, penalty: '205800.00' },
    difference: { sign: 1, amount: '205800.00' },
    latePenalty: null,
    newNights: [{ date: '2026-12-12', left: 2, bookable: true }],
    roomTypes: [],
    breaks: [],
    breakAlreadyAllowed: false,
    discount: null,
    existingDiscount: null,
    fx: null,
    canWaive: false,
    ...overrides,
  }
}

const online = { waive: false, canWaive: false, online: true }

describe('the Save button', () => {
  it('carries the difference, or says why it is disabled', () => {
    expect(saveState(quote(), online).label).toBe('Save · +₦205,800.00')
    expect(saveState(quote({ difference: { sign: -1, amount: '205800.00' } }), online).label).toBe(
      'Save · −₦205,800.00',
    )
    expect(saveState(quote({ changed: false }), online)).toMatchObject({
      disabled: true,
      hint: 'Nothing to save yet',
    })
    expect(saveState(quote(), { ...online, online: false }).hint).toBe(
      'Changing a booking needs a connection.',
    )
    expect(
      saveState(quote({ newNights: [{ date: '2026-12-12', left: 0, bookable: false }] }), online)
        .hint,
    ).toBe('Sold out 12 Dec')
  })

  it('asks for approval over the limit, and shows or waives a late-change penalty', () => {
    const over = quote({
      discount: { percent: '15', limit: '12.00', within: false, scope: 'new_nights' },
    })
    expect(saveState(over, online)).toMatchObject({
      label: 'Ask for approval · 15%',
      action: 'ask_discount',
    })
    const late = quote({
      latePenalty: { amount: '165375.00', drop: '165375.00', deadline: null, nonRefundable: true },
    })
    expect(saveState(late, online).label).toBe('Save · ₦165,375.00 penalty')
    expect(saveState(late, { ...online, waive: true })).toMatchObject({
      label: 'Ask to waive ₦165,375.00',
      action: 'ask_waiver',
    })
    expect(saveState(late, { ...online, waive: true, canWaive: true }).label).toBe(
      'Save and waive ₦165,375.00',
    )
  })
})

describe('Modify words', () => {
  it('labels new nights and rooms free', () => {
    expect(newNightLine('2026-12-12', 'Bed & breakfast')).toBe(
      "Sat 12 Dec · Bed & breakfast · new night at today's rate",
    )
    expect(availabilityLine(quote())).toEqual({
      tone: 'emerald',
      text: 'Deluxe King is free on 12 Dec. Same plan, no approval needed.',
    })
    expect(
      lateChangeLine(
        quote({
          latePenalty: {
            amount: '165375.00',
            drop: '165375.00',
            deadline: '2026-12-07T13:00:00.000Z',
            nonRefundable: false,
          },
        }),
        TZ,
      ),
    ).toBe(
      'Free changes ended 7 Dec 2026, 14:00. This change lowers the stay by ₦165,375.00, so a penalty of ₦165,375.00 applies.',
    )
  })
})

function endQuote(overrides: Partial<EndQuote> = {}): EndQuote {
  return {
    reservationId: ID,
    number: 'VI-2611-0447',
    guestName: 'Kelechi Obi',
    mode: 'cancel',
    version: 1,
    allowed: true,
    blocked: null,
    arrival: '2026-11-26',
    departure: '2026-11-28',
    roomTypeName: 'Executive King',
    policy: 'Best available: free until 48 h before arrival',
    deadline: '2026-11-24T13:00:00.000Z',
    nonRefundable: false,
    penalty: { kind: 'late_cancellation', amount: '257250.00', basisLabel: 'First night' },
    noPenalty: null,
    released: ['2026-11-26', '2026-11-27'],
    canWaive: false,
    fx: null,
    ...overrides,
  }
}

describe('Cancel and no-show words', () => {
  const now = new Date('2026-11-25T10:20:00Z')
  it('says when it arrives and whether free cancellation ended', () => {
    expect(endSubtitle(endQuote(), '2026-11-25', TZ, now)).toBe(
      'Arrives tomorrow · free cancellation ended 24 Nov 2026, 14:00',
    )
    expect(
      endSubtitle(endQuote({ mode: 'no_show', arrival: '2026-11-25' }), '2026-11-25', TZ),
    ).toBe('Arrival 25 Nov 2026 · not checked in')
    expect(releasedLine(['2026-11-26', '2026-11-27'])).toBe('2 nights released (26 and 27 Nov)')
  })

  it('labels the button by penalty and waiver', () => {
    expect(endButton(endQuote(), { waive: false, canWaive: false }).label).toBe(
      'Cancel booking · ₦257,250.00 penalty',
    )
    expect(endButton(endQuote(), { waive: true, canWaive: false })).toEqual({
      label: 'Ask to waive ₦257,250.00',
      asks: true,
    })
    expect(endButton(endQuote(), { waive: true, canWaive: true }).label).toBe(
      'Cancel and waive ₦257,250.00',
    )
    expect(
      endButton(
        endQuote({
          mode: 'no_show',
          penalty: { kind: 'no_show', amount: '183750.00', basisLabel: 'First night' },
        }),
        {
          waive: true,
          canWaive: true,
        },
      ).label,
    ).toBe('Mark no-show and waive ₦183,750.00')
    expect(endButton(endQuote({ penalty: null }), { waive: false, canWaive: false }).label).toBe(
      'Cancel booking',
    )
    expect(waiverNeedsLine(['Sade Bakare', 'Tunde Bello', 'Adaeze Okafor'])).toBe(
      'Waiving needs a manager. Sade, Tunde or Adaeze can approve it.',
    )
  })
})

const penalty = (overrides: Partial<PenaltyView> = {}): PenaltyView => ({
  id: ID,
  kind: 'late_cancellation',
  amount: '257250.00',
  basisLabel: 'First night',
  status: 'to_charge',
  businessDate: '2026-11-25',
  waived: null,
  request: null,
  ...overrides,
})

describe('the Penalty card', () => {
  const desk = { canWaive: false, canManage: true, timeZone: TZ }
  it('shows to charge, asked, declined and waived', () => {
    expect(penaltyState(penalty(), desk)).toMatchObject({ badge: 'To charge', action: 'ask' })
    expect(penaltyState(penalty(), { ...desk, canWaive: true }).action).toBe('waive')
    expect(
      penaltyState(
        penalty({
          request: {
            approvalId: ID,
            status: 'pending',
            approverName: 'Tunde Bello',
            expiresAt: '2026-11-26T00:08:00.000Z',
            comment: null,
            mine: true,
          },
        }),
        desk,
      ),
    ).toMatchObject({ badge: 'Waiver asked', line: 'Waiver asked of Tunde Bello · expires 01:08' })
    expect(
      penaltyState(
        penalty({
          request: {
            approvalId: ID,
            status: 'declined',
            approverName: 'Tunde Bello',
            expiresAt: '2026-11-26T00:08:00.000Z',
            comment: 'Policy applies for this rate',
            mine: true,
          },
        }),
        desk,
      ),
    ).toMatchObject({
      line: 'Tunde Bello declined: “Policy applies for this rate”',
      action: 'ask_again',
    })
    expect(
      penaltyState(
        penalty({
          status: 'waived',
          waived: {
            byName: 'Chiamaka Eze',
            at: '2026-11-25T10:21:00.000Z',
            reason: 'Regular guest, rebooking for January',
            approverName: 'Tunde Bello',
            method: 'pin_here',
          },
        }),
        desk,
      ),
    ).toMatchObject({
      badge: 'Waived',
      line: 'Waived · Approved by Tunde Bello · “Regular guest, rebooking for January”',
    })
  })
})

describe('the banner and the copied cancellation', () => {
  const detail = {
    id: ID,
    number: 'VI-2611-0447',
    status: 'cancelled',
    property: { name: 'Kora Victoria Island', timeZone: TZ },
    guest: { firstName: 'Kelechi' },
    end: {
      kind: 'cancelled',
      at: '2026-11-25T10:20:00.000Z',
      businessDate: '2026-11-25',
      byName: 'Chiamaka Eze',
      reason: 'guest_request',
      reasonText: null,
      note: 'Meeting moved to January',
    },
    stays: [{ roomTypeName: 'Executive King', arrival: '2026-11-26', departure: '2026-11-28' }],
    penalties: [penalty()],
  } as unknown as ReservationDetail

  it('says who cancelled, when and why', () => {
    expect(endBanner(detail)).toBe(
      'Cancelled 25 Nov 2026, 11:20 by Chiamaka Eze · Guest request · “Meeting moved to January”',
    )
    const night = {
      ...detail,
      end: {
        ...detail.end,
        kind: 'no_show',
        at: '2026-11-25T23:35:00.000Z',
        reason: null,
        note: null,
      },
    } as unknown as ReservationDetail
    expect(endBanner(night)).toBe(
      'Marked no-show 26 Nov 2026, 00:35 (business date 25 Nov) by Ibrahim Musa'.replace(
        'Ibrahim Musa',
        'Chiamaka Eze',
      ),
    )
  })

  it('copies the charge, or says there is none', () => {
    expect(cancellationText(detail)).toBe(
      "Kora Victoria Island: Hello Kelechi, your booking VI-2611-0447 for Executive King, 26–28 Nov 2026 is cancelled. Under the booking's terms a cancellation charge of ₦257,250.00 applies. Questions? Reply to this message.",
    )
    expect(cancellationText({ ...detail, penalties: [] })).toMatch(
      /is cancelled\. There is no charge\./,
    )
  })
})
