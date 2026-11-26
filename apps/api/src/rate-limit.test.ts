import { describe, expect, it } from 'vitest'
import { clientAddress, RateLimiter } from './rate-limit.ts'

describe('RateLimiter', () => {
  it('allows up to the limit, then refuses', () => {
    const limiter = new RateLimiter()
    limiter.take('join:1.2.3.4', 2, 60)
    limiter.take('join:1.2.3.4', 2, 60)
    expect(() => limiter.take('join:1.2.3.4', 2, 60)).toThrow('Too many tries')
    expect(() => limiter.take('join:5.6.7.8', 2, 60)).not.toThrow()
  })

  it('counts a cost, e.g. one per email in a batch of invites', () => {
    const limiter = new RateLimiter()
    limiter.take('invite:m1', 20, 3600, 15)
    expect(() => limiter.take('invite:m1', 20, 3600, 6)).toThrow()
  })

  it('does nothing when switched off', () => {
    const limiter = new RateLimiter(false)
    for (let i = 0; i < 5; i++) limiter.take('k', 1, 60)
  })

  it('reads the first forwarded address', () => {
    expect(clientAddress(new Headers({ 'x-forwarded-for': '41.58.1.2, 10.0.0.1' }))).toBe(
      '41.58.1.2',
    )
    expect(clientAddress(new Headers())).toBe('local')
  })
})
