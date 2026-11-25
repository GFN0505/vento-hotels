import { describe, expect, it } from 'vitest'
import { assignableRoles, formatLimit, hotelsSummary, splitEmails } from './team'

describe('team helpers', () => {
  it('summarises hotels without overflowing a table cell', () => {
    expect(hotelsSummary(true, [])).toBe('Whole group')
    expect(hotelsSummary(false, [{ name: 'VI' }])).toBe('VI')
    expect(hotelsSummary(false, [{ name: 'VI' }, { name: 'Abuja' }, { name: 'PH' }])).toBe(
      'VI, Abuja +1',
    )
  })

  it('formats limits as the grid shows them', () => {
    expect(formatLimit('percent', '10.00')).toBe('≤10%')
    expect(formatLimit('percent', '12.50')).toBe('≤12.5%')
    expect(formatLimit('amount_ngn', '100000.00')).toBe('≤₦100k')
    expect(formatLimit('amount_ngn', '2500000')).toBe('≤₦2.5m')
    expect(formatLimit('amount_ngn', '500')).toBe('≤₦500')
    expect(formatLimit('percent', null)).toBe('')
  })

  it('splits pasted emails on commas, spaces and new lines, once each', () => {
    expect(splitEmails('Ada@x.ng, b@y.ng\nb@y.ng;  c@z.ng ')).toEqual([
      'ada@x.ng',
      'b@y.ng',
      'c@z.ng',
    ])
  })

  it('lets only owners hand out owner and group admin', () => {
    expect(assignableRoles('owner')).toContain('owner')
    expect(assignableRoles('group_admin')).not.toContain('group_admin')
    expect(assignableRoles('group_admin')).toContain('front_desk')
  })
})
