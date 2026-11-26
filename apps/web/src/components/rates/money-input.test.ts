import { describe, expect, it } from 'vitest'
import { groupTyped, nairaField } from './money-input'

describe('naira fields', () => {
  it('shows stored amounts as whole naira with separators', () => {
    expect(nairaField('120000.00')).toBe('120,000')
    expect(nairaField('-5000.00')).toBe('-5,000')
    expect(nairaField(null)).toBe('')
  })

  it('groups a typed whole number and leaves anything else for its message', () => {
    expect(groupTyped('150000')).toBe('150,000')
    expect(groupTyped(' 1,500,000 ')).toBe('1,500,000')
    expect(groupTyped('−18000')).toBe('-18,000')
    expect(groupTyped('120000.50')).toBe('120000.50')
    expect(groupTyped('')).toBe('')
  })
})
