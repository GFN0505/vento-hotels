// Sign-in attempts are limited per network address (decision 0017; limits in auth.ts).
import { afterAll, describe, expect, it } from 'vitest'
import { createTestApp } from '../test/harness.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('sign-in limit', () => {
  const t = createTestApp(url ?? '', { rateLimit: true })
  afterAll(() => t.close())

  const attempt = (ip: string) =>
    t.call('/api/auth/sign-in/email', {
      ip,
      body: { email: 'nobody@example.test', password: 'Wrong-pass-1!' },
    })

  it('pauses a network after 15 attempts in 10 minutes, and only that network', async () => {
    const hotelNetwork = '203.0.113.10'
    for (let i = 0; i < 15; i++) {
      expect((await attempt(hotelNetwork)).status).toBe(401)
    }
    const paused = await attempt(hotelNetwork)
    expect(paused.status).toBe(429)
    expect(Number(paused.headers.get('x-retry-after'))).toBeGreaterThan(0)

    // Another hotel on a different connection is unaffected.
    expect((await attempt('198.51.100.20')).status).toBe(401)
  })
})
