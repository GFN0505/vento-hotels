// The demo seed loads a working group: people can sign in and see exactly what their role allows.
import type { MemberView, Property } from '@vento/shared'
import { newId } from '@vento/shared'
import { afterAll, describe, expect, it } from 'vitest'
import { createTestApp } from '../test/harness.ts'
import { seedDemo } from './demo.ts'

const url = process.env.TEST_DATABASE_URL
const PASSWORD = 'Demo-pass-42!'

describe.skipIf(!url)('demo seed', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  const run = newId().slice(-8)
  const options = {
    password: PASSWORD,
    slug: `kora-demo-${run}`,
    emailDomain: `kora-${run}.example`,
  }

  const signInAs = async (email: string) => {
    const response = await t.call('/api/auth/sign-in/email', {
      body: { email, password: PASSWORD },
    })
    expect(response.status).toBe(200)
    const cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    const organizations = await t.call('/api/auth/organization/list', { cookie })
    const [group] = (await organizations.json()) as { id: string }[]
    await t.call('/api/auth/organization/set-active', {
      cookie,
      body: { organizationId: group?.id },
    })
    return cookie
  }

  it('loads Kora Hotels Group once, with its people and hotels', async () => {
    const first = await seedDemo(t.db, options)
    expect(first.status).toBe('seeded')
    if (first.status !== 'seeded') return
    expect(first.people).toHaveLength(10)
    expect(first.people[0]).toMatchObject({ name: 'Adaeze Okafor', role: 'owner' })

    const again = await seedDemo(t.db, options)
    expect(again).toEqual({ status: 'exists', organizationId: first.organizationId })
  })

  it('lets the owner sign in and see the whole group', async () => {
    const cookie = await signInAs(`adaeze@${options.emailDomain}`)
    const hotels = await t.rpc<{ items: Property[] }>(cookie, 'properties/list', {})
    expect(hotels.data.items.map((h) => h.name).sort()).toEqual([
      'Kora Abuja',
      'Kora Ikeja GRA',
      'Kora Port Harcourt',
      'Kora Victoria Island',
    ])
    const team = await t.rpc<{ items: MemberView[]; total: number }>(cookie, 'members/list', {
      pageSize: 100,
    })
    expect(team.data.total).toBe(10)
    expect(team.data.items.every((m) => m.hasPin)).toBe(true)
  })

  it('keeps the GM of Victoria Island to Victoria Island', async () => {
    const cookie = await signInAs(`tunde@${options.emailDomain}`)
    const hotels = await t.rpc<{ items: Property[] }>(cookie, 'properties/list', {})
    expect(hotels.data.items.map((h) => h.name)).toEqual(['Kora Victoria Island'])
  })
})
