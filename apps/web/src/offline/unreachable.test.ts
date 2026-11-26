import { describe, expect, it } from 'vitest'
import { neverReached } from './unreachable'

describe('neverReached', () => {
  it('spots a fetch that never left the device, even when wrapped', () => {
    expect(neverReached(new TypeError('Failed to fetch'))).toBe(true)
    expect(neverReached(new Error('wrapped', { cause: new TypeError('Failed to fetch') }))).toBe(
      true,
    )
  })

  it("doesn't treat Vento's own answers as offline", () => {
    expect(neverReached(Object.assign(new Error('Forbidden'), { status: 403 }))).toBe(false)
    expect(neverReached(undefined)).toBe(false)
  })
})
