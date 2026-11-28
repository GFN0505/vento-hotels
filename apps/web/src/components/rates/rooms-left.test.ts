import { describe, expect, it } from 'vitest'
import { leftFigure, leftTone, leftWords } from './rooms-left'

describe('rooms left', () => {
  it('colours as the tape chart: 0 and below red, 1–2 amber, the rest muted', () => {
    expect([-1, 0, 1, 2, 3].map(leftTone)).toEqual([
      'text-ro',
      'text-ro',
      'text-am',
      'text-am',
      'text-text-2',
    ])
  })

  it('shows an overbooked night with a minus sign', () => {
    expect([-2, 0, 4].map(leftFigure)).toEqual(['−2', '0', '4'])
  })

  it('says it in words, with rooms out of order', () => {
    expect(leftWords({ left: 4, outOfOrder: 0 })).toBe('4 left')
    expect(leftWords({ left: 0, outOfOrder: 1 })).toBe('Sold out, 1 out of order')
    expect(leftWords({ left: -1, outOfOrder: 0 })).toBe('1 more booking than rooms')
    expect(leftWords({ left: -2, outOfOrder: 0 })).toBe('2 more bookings than rooms')
  })
})
