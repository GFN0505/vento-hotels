// Wrong PINs typed at one requester's screen, whichever manager they were for (review: one desk
// user mustn't be able to lock out every manager quickly). Below the PIN counter's own limit of 5
// per approver, so a desk can't even lock one manager on its own. In memory per API process, like
// the request limiter (rate-limit.ts); always on, tests reset it.
const MAX_WRONG = 4
const WINDOW_MS = 15 * 60 * 1000

const tries = new Map<string, { resetAt: number; wrong: number }>()

export function wrongTriesLeft(requesterMemberId: string, now = Date.now()): number {
  const window = tries.get(requesterMemberId)
  if (!window || window.resetAt <= now) return MAX_WRONG
  return MAX_WRONG - window.wrong
}

export function countWrongTry(requesterMemberId: string, now = Date.now()): void {
  const current = tries.get(requesterMemberId)
  const window = current && current.resetAt > now ? current : { resetAt: now + WINDOW_MS, wrong: 0 }
  window.wrong += 1
  tries.set(requesterMemberId, window)
  if (tries.size > 10_000) {
    for (const [key, value] of tries) if (value.resetAt <= now) tries.delete(key)
  }
}

export function resetWrongTries(): void {
  tries.clear()
}
