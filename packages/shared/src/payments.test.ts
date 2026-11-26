import { describe, expect, it } from 'vitest'
import { stateCodeOf, stateShortName } from './locale.ts'
import {
  accountNumberSchema,
  bankAccountLabel,
  cashForeignCurrenciesSchema,
  PAYMENT_METHOD_INFO,
  terminalIdSchema,
} from './payments.ts'

describe('payment setup rules', () => {
  it('takes a 10-digit NUBAN, ignoring spaces, and says what is wrong otherwise', () => {
    expect(accountNumberSchema.parse('0123 454 471')).toBe('0123454471')
    const short = accountNumberSchema.safeParse('012345447')
    expect(short.success).toBe(false)
    expect(short.error?.issues[0]?.message).toBe('Enter the 10-digit account number.')
  })

  it('masks account numbers in labels', () => {
    expect(bankAccountLabel({ bankName: 'Zenith Bank', accountNumber: '0123454471' })).toBe(
      'Zenith Bank ••••4471',
    )
  })

  it('stores terminal IDs in capitals, letters and digits only', () => {
    expect(terminalIdSchema.parse('2mpt 4471')).toBe('2MPT4471')
    expect(terminalIdSchema.safeParse('2MPT-4471').success).toBe(false)
    expect(terminalIdSchema.safeParse('A'.repeat(21)).success).toBe(false)
  })

  it('keeps foreign cash in a fixed order, once each', () => {
    expect(cashForeignCurrenciesSchema.parse(['GBP', 'USD', 'GBP'])).toEqual(['USD', 'GBP'])
  })

  it('switches Online card off by default, with the reason it waits', () => {
    expect(PAYMENT_METHOD_INFO.card_online).toMatchObject({ defaultOn: false })
    expect(PAYMENT_METHOD_INFO.cash.defaultOn).toBe(true)
  })

  it('maps states to their codes for state taxes', () => {
    expect(stateCodeOf('Lagos')).toBe('LA')
    expect(stateCodeOf('FCT (Abuja)')).toBe('FC')
    expect(stateCodeOf(null)).toBeNull()
    expect(stateShortName('FC')).toBe('FCT')
    expect(stateShortName('RI')).toBe('Rivers')
  })
})
