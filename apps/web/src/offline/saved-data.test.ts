import { describe, expect, it } from 'vitest'
import { isKept } from './saved-data'

describe('isKept', () => {
  it('keeps reference data for opening offline, nothing else', () => {
    expect(isKept([['organization', 'current'], { type: 'query' }])).toBe(true)
    expect(isKept([['properties', 'list'], { input: { pageSize: 100 }, type: 'query' }])).toBe(true)
    expect(isKept([['members', 'list'], { type: 'query' }])).toBe(false)
    expect(isKept([['audit', 'list'], { type: 'query' }])).toBe(false)
    expect(isKept(['session'])).toBe(false)
  })
})
