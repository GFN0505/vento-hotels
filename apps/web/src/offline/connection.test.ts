import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOnline, markReachable, markUnreachable } from './connection'

describe('connection', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ignores a late reply while the browser says it is offline', () => {
    vi.stubGlobal('navigator', { onLine: false })
    markUnreachable()
    markReachable()
    expect(isOnline()).toBe(false)
  })

  it('comes back when a reply arrives and the browser is online', () => {
    vi.stubGlobal('navigator', { onLine: true })
    markUnreachable()
    markReachable()
    expect(isOnline()).toBe(true)
  })
})
