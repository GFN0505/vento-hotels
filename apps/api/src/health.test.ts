import { describe, expect, it } from 'vitest'
import { health } from './health.ts'

describe('health', () => {
  it('reports ok with the shared default time zone', () => {
    expect(health()).toEqual({ status: 'ok', defaultTimeZone: 'Africa/Lagos' })
  })
})
