// The demo seed loads a working group: people can sign in and see exactly what their role allows.
import type { HomeSummary, MemberView, Property, RoomTypeView, RoomView } from '@vento/shared'
import { newId } from '@vento/shared'
import { afterAll, describe, expect, it } from 'vitest'
import { switchFeature } from '../features/switches.ts'
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

  it("counts each hotel's people and devices for Home, within what the member sees", async () => {
    const byName = async (cookie: string) => {
      const [hotels, home] = await Promise.all([
        t.rpc<{ items: Property[] }>(cookie, 'properties/list', {}),
        t.rpc<HomeSummary>(cookie, 'organization/home', {}),
      ])
      return Object.fromEntries(
        home.data.byHotel.map((row) => [
          hotels.data.items.find((h) => h.id === row.propertyId)?.name,
          { people: row.people, devices: row.devices, rooms: row.rooms },
        ]),
      )
    }
    // Two people see every hotel (owner and finance); eight more work at Victoria Island.
    expect(await byName(await signInAs(`adaeze@${options.emailDomain}`))).toEqual({
      'Kora Victoria Island': { people: 10, devices: 3, rooms: 120 },
      'Kora Ikeja GRA': { people: 2, devices: 0, rooms: 86 },
      'Kora Abuja': { people: 2, devices: 0, rooms: 104 },
      'Kora Port Harcourt': { people: 2, devices: 0, rooms: 72 },
    })
    const frontDesk = await signInAs(`chiamaka@${options.emailDomain}`)
    expect(await byName(frontDesk)).toEqual({
      'Kora Victoria Island': { people: 10, devices: 3, rooms: 120 },
    })
    const home = await t.rpc<HomeSummary>(frontDesk, 'organization/home', {})
    expect(home.data.members).toBeNull()
  })

  it('sets up Kora Victoria Island’s rooms exactly as the designs show', async () => {
    const owner = await signInAs(`adaeze@${options.emailDomain}`)
    const home = await t.rpc<HomeSummary>(owner, 'organization/home', {})
    expect(home.data.rooms).toBe(382)

    const seeded = await seedDemo(t.db, options)
    await switchFeature(t.db, seeded.organizationId, {
      feature: 'front_desk',
      to: 'on',
      reason: 'Seed test',
    })
    const gm = await signInAs(`tunde@${options.emailDomain}`)
    const [vi] = (await t.rpc<{ items: Property[] }>(gm, 'properties/list', {})).data.items
    expect(vi?.liveSince).toBe('2024-03-01')
    const types = await t.rpc<{ items: RoomTypeView[] }>(gm, 'roomTypes/list', {
      propertyId: vi?.id,
    })
    expect(types.data.items.map((type) => [type.code, type.roomCount])).toEqual([
      ['STQ', 36],
      ['DLK', 48],
      ['EXK', 28],
      ['JRS', 8],
    ])
    const find = async (q: string) =>
      (
        await t.rpc<{ items: RoomView[] }>(gm, 'rooms/list', { propertyId: vi?.id, q })
      ).data.items.find((room) => room.number === q)
    expect(await find('401')).toMatchObject({
      features: ['City view'],
      connectingRooms: [{ number: '402' }],
      housekeepingStatus: 'inspected',
    })
    expect(await find('407')).toMatchObject({ accessible: true, features: ['Roll-in shower'] })
    expect((await find('808'))?.roomTypeCode).toBe('STQ')
    expect((await find('809'))?.roomTypeCode).toBe('DLK')
  })
})
