// The brick 10 seam: what a shift should hold, by line, from its opening float and payments.
import { describe, expect, it } from 'vitest'
import { expectedFromPayments, type LineKey, type ShiftPayment } from './expected.ts'

const lines: LineKey[] = [
  { kind: 'cash', currency: 'NGN', posTerminalId: null },
  { kind: 'cash', currency: 'USD', posTerminalId: null },
  { kind: 'pos_terminal', currency: 'NGN', posTerminalId: 'desk-terminal' },
  { kind: 'bank_transfer', currency: 'NGN', posTerminalId: null },
]

const pay = (p: Partial<ShiftPayment> & Pick<ShiftPayment, 'method' | 'amount'>): ShiftPayment => ({
  direction: 'in',
  currency: 'NGN',
  posTerminalId: null,
  ...p,
})

describe('expectedFromPayments', () => {
  it('is the opening float on naira cash and nothing elsewhere without payments', () => {
    expect(expectedFromPayments({ openingFloat: '50000.00' }, lines, [])).toEqual([
      { ...lines[0], expected: '50000.00' },
      { ...lines[1], expected: '0.00' },
      { ...lines[2], expected: '0.00' },
      { ...lines[3], expected: '0.00' },
    ])
  })

  it('adds cash in, takes cash refunds out, per currency, terminal and transfer', () => {
    const result = expectedFromPayments({ openingFloat: '50000.00' }, lines, [
      pay({ method: 'cash', amount: '30000.10' }),
      pay({ method: 'cash', amount: '5000.05', direction: 'out' }),
      pay({ method: 'cash', amount: '40', currency: 'USD' }),
      pay({ method: 'cash', amount: '10', currency: 'GBP' }),
      pay({ method: 'pos_terminal', amount: '120000', posTerminalId: 'desk-terminal' }),
      pay({ method: 'pos_terminal', amount: '7500.5', posTerminalId: 'bar-terminal' }),
      pay({ method: 'bank_transfer', amount: '250000' }),
    ])
    const by = (kind: string, currency: string, terminal: string | null = null) =>
      result.find((l) => l.kind === kind && l.currency === currency && l.posTerminalId === terminal)
        ?.expected
    expect(by('cash', 'NGN')).toBe('75000.05')
    expect(by('cash', 'USD')).toBe('40.00')
    // A currency or terminal that isn't among the lines still gets one.
    expect(by('cash', 'GBP')).toBe('10.00')
    expect(by('pos_terminal', 'NGN', 'desk-terminal')).toBe('120000.00')
    expect(by('pos_terminal', 'NGN', 'bar-terminal')).toBe('7500.50')
    expect(by('bank_transfer', 'NGN')).toBe('250000.00')
  })
})
