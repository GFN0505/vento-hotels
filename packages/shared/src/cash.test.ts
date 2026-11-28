import { describe, expect, it } from 'vitest'
import {
  bagNumberSchema,
  cashAmount,
  countTotal,
  differenceWords,
  EMPTY_COUNT,
  lineDifference,
  nairaAt,
  noteCountSchema,
  totalDifference,
} from './cash.ts'

describe('cash counts', () => {
  it('adds notes by value and the smaller notes and coins, with decimals', () => {
    expect(countTotal({ ...EMPTY_COUNT, '1000': 30, '500': 30, '200': 20, '100': 10 })).toBe(
      '50000.00',
    )
    expect(countTotal({ ...EMPTY_COUNT, '50': 3, coins: '0.10' })).toBe('150.10')
    expect(countTotal({ ...EMPTY_COUNT, '1000': 99_999, coins: '99999.00' })).toBe('100098999.00')
  })

  it('accepts whole notes up to 99,999 only', () => {
    expect(
      noteCountSchema.safeParse({ ...EMPTY_COUNT, '1000': 1.5 }).error?.issues[0]?.message,
    ).toBe('Enter a whole number of notes.')
    expect(
      noteCountSchema.safeParse({ ...EMPTY_COUNT, '500': 100_000 }).error?.issues[0]?.message,
    ).toBe("That's more than 99,999 notes. Check the count.")
    expect(noteCountSchema.safeParse({ ...EMPTY_COUNT, coins: '100000' }).success).toBe(false)
  })

  it('works out differences, the total of absolutes and the words', () => {
    expect(lineDifference('47500', '50000.00')).toBe('-2500.00')
    expect(
      totalDifference([
        { differenceNgn: '-2500.00' },
        { differenceNgn: '2500.00' },
        { differenceNgn: '0' },
      ]),
    ).toBe('5000.00')
    expect(differenceWords('-2500')).toEqual({ amount: '₦2,500.00', words: 'short' })
    expect(differenceWords('12500')).toEqual({ amount: '₦12,500.00', words: 'over' })
    expect(differenceWords('0.00')).toBeNull()
  })

  it('converts foreign cash once, half-up, and shows it in its own currency', () => {
    expect(nairaAt('40', '1620')).toBe('64800.00')
    expect(nairaAt('0.33', '1620.125')).toBe('534.64')
    expect(cashAmount('40', 'USD')).toBe('$40.00')
    expect(cashAmount('-1234.5', 'GBP')).toBe('−£1,234.50')
  })

  it('reads safe bag numbers as typed, in capitals', () => {
    expect(bagNumberSchema.parse(' s-2211 ')).toBe('S-2211')
    expect(bagNumberSchema.safeParse('S 2211').success).toBe(false)
  })
})
