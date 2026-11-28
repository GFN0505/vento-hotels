import { describe, expect, it } from 'vitest'
import {
  draftProblems,
  draftTotal,
  EMPTY_DRAFT,
  noteProblem,
  rowTotal,
  toCount,
} from './count-model'
import {
  closeBadge,
  closeLabel,
  compareWords,
  confirmLine,
  differenceLine,
  foreignShort,
  handoverDifference,
  limitLine,
  overLimit,
  rowDifference,
  sourceOf,
  toSafe,
} from './format'

const float = { ...EMPTY_DRAFT, '1000': '30', '500': '30', '200': '20', '100': '10' }

describe('counting by note', () => {
  it('totals each row and the float as she types, empty rows as 0', () => {
    expect(rowTotal('1000', '30')).toBe('30000.00')
    expect(rowTotal('500', '')).toBe('0.00')
    expect(draftTotal(float)).toBe('50000.00')
    expect(draftTotal({ ...float, coins: '120.5' })).toBe('50120.50')
    expect(toCount({ ...float, '50': '1,000' })['50']).toBe(1000)
  })

  it('asks for whole notes, up to 99,999', () => {
    expect(noteProblem('2.5')).toBe('Enter a whole number of notes.')
    expect(noteProblem('100000')).toBe("That's more than 99,999 notes. Check the count.")
    expect(draftProblems({ ...float, coins: '100000' })).toEqual({
      coins: 'Smaller notes and coins go up to ₦99,999.00.',
    })
  })

  it('compares the hand-over live', () => {
    expect(compareWords(handoverDifference('50000.00', '50000.00'))).toEqual({
      text: 'matches',
      tone: 'emerald',
    })
    expect(compareWords(handoverDifference('48000.00', '50000.00')).text).toBe('₦2,000.00 short')
    expect(handoverDifference('50000.00', '0.00')).toBe('0.00')
  })
})

const line = (over: Partial<Parameters<typeof sourceOf>[0]>) => ({
  kind: 'cash' as const,
  currency: 'NGN' as const,
  posTerminalId: null,
  label: 'Cash ₦',
  notes: null,
  counted: '0.00',
  expected: '0.00',
  difference: '0.00',
  fx: null,
  countedNgn: '0.00',
  expectedNgn: '0.00',
  differenceNgn: '0.00',
  toSafe: null,
  ...over,
})

describe('the close panel', () => {
  it('words the limit, the badge, the difference and the button', () => {
    expect(limitLine('2500.00', '5000.00')).toBe('Within your ₦5,000.00 limit')
    expect(limitLine('12500.00', '5000.00')).toBe(
      'Over your ₦5,000.00 limit. A manager can approve it here.',
    )
    expect(overLimit('12500.00', null)).toBe(false)
    expect(limitLine('100.00', '0.00')).toBe("Any difference needs a manager's approval.")
    const short = [line({ differenceNgn: '-2500.00', difference: '-2500.00' })]
    expect(closeBadge(short)).toEqual({ label: 'Short', tone: 'amber' })
    expect(closeBadge([line({})])).toEqual({ label: 'Balanced', tone: 'emerald' })
    expect(differenceLine(short, '2500.00')).toBe('Cash ₦2,500.00 short')
    expect(
      differenceLine(
        [
          ...short,
          line({
            kind: 'pos_terminal',
            label: 'POS · Moniepoint · Desk 1',
            differenceNgn: '2500.00',
          }),
        ],
        '5000.00',
      ),
    ).toBe('Total difference ₦5,000.00 · cash ₦2,500.00 short, POS ₦2,500.00 over')
    expect(toSafe('459500.00', '50000.00')).toBe('409500.00')
    expect(closeLabel('409500.00')).toBe('Close shift · drop ₦409,500.00 to safe')
    expect(closeLabel('0.00')).toBe('Close shift')
  })

  it('names the source, with the rate used for foreign cash', () => {
    expect(
      sourceOf(
        line({
          currency: 'USD',
          counted: '40.00',
          countedNgn: '64800.00',
          fx: { rate: '1620.0000', source: 'cbn', date: '2026-11-25' },
        }),
      ),
    ).toBe('Drawer count · ≈ ₦64,800.00 at ₦1,620/$, CBN, 25 Nov 2026')
    expect(sourceOf(line({ kind: 'bank_transfer' }))).toBe('Your transfer log')
  })

  it('asks once with every figure', () => {
    expect(
      confirmLine([
        'Cash ₦50,000.00',
        foreignShort('0', 'USD'),
        foreignShort('0', 'GBP'),
        'POS ₦0.00',
      ]),
    ).toBe(
      "Submit your count? Cash ₦50,000.00 · US$0.00 · £0.00 · POS ₦0.00. You can't change it after you submit.",
    )
  })
})

describe('the Shifts list', () => {
  const row = {
    id: '0',
    number: 2,
    businessDate: '2026-11-24',
    drawerName: 'Desk 1',
    memberName: 'Tunde Bello',
    status: 'closed' as const,
    openedAt: '2026-11-24T14:00:00.000Z',
    closedAt: '2026-11-24T21:50:00.000Z',
    openingFloat: '50000.00',
    handoverDifference: '2500.00',
    totalDifference: '0.00',
    cashDifference: '0.00',
    approvedBy: null,
    timeZone: 'Africa/Lagos',
  }
  it('says Balanced, short or over, and never a figure while open', () => {
    expect(rowDifference(row)).toBe('Balanced · ₦2,500.00 over at hand-over')
    expect(
      rowDifference({
        ...row,
        handoverDifference: '0.00',
        totalDifference: '2500.00',
        cashDifference: '-2500.00',
      }),
    ).toBe('₦2,500.00 short')
    expect(
      rowDifference({ ...row, status: 'open', totalDifference: null, cashDifference: null }),
    ).toBe('Counted at close')
  })
})
