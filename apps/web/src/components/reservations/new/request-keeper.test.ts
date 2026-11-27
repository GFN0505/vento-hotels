import { describe, expect, it } from 'vitest'
import { createRequestKeeper } from './request-keeper'

describe('the request in flight', () => {
  it('replays the same request after a dropped connection, even if the quote moved on', () => {
    const keeper = createRequestKeeper<{ quoteHash: string }>()
    const first = keeper.take(() => ({ quoteHash: 'quoted' }))
    const retry = keeper.take(() => ({ quoteHash: 'requoted' }))
    expect(retry).toBe(first)
    keeper.clear()
    expect(keeper.take(() => ({ quoteHash: 'next' })).quoteHash).toBe('next')
  })
})
