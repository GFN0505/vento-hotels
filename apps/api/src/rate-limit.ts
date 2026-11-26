// A small per-key rate limiter for Vento's own public or email-sending procedures (sign-in has
// Better Auth's). Fixed windows in memory: it resets when the API restarts, so move it to the
// database when running more than one API instance (same as Better Auth's, see auth.ts).
import { ORPCError } from '@orpc/server'

export class RateLimiter {
  private readonly windows = new Map<string, { resetAt: number; used: number }>()

  private readonly enabled: boolean

  constructor(enabled = true) {
    this.enabled = enabled
  }

  // Counts `cost` against `key` and refuses once `max` is used up within `windowSeconds`.
  take(key: string, max: number, windowSeconds: number, cost = 1): void {
    if (!this.enabled) return
    const now = Date.now()
    const current = this.windows.get(key)
    const window =
      current && current.resetAt > now ? current : { resetAt: now + windowSeconds * 1000, used: 0 }
    if (window.used + cost > max) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Too many tries. Wait a few minutes, then try again.',
      })
    }
    window.used += cost
    this.windows.set(key, window)
    if (this.windows.size > 10_000) this.sweep(now)
  }

  private sweep(now: number) {
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key)
  }
}

// The caller's network address, as the proxy in front of the API reports it.
export function clientAddress(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'local'
  )
}
