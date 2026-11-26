// Shared devices and PIN sign-in on the real test database through the real HTTP flow
// (spec: docs/specs/stage-0-devices-and-pin.md, decision 0022).
import type { DeviceView, Entity, LockScreen, Property } from '@vento/shared'
import { eq, isNotNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sessions } from '../db/schema/auth.ts'
import { memberPins } from '../db/schema/tenancy.ts'
import { ABUJA_ADDRESS } from '../test/addresses.ts'
import { createTestApp, PASSWORD } from '../test/harness.ts'

const url = process.env.TEST_DATABASE_URL

type Person = { cookie: string; userId: string; email: string }
type Page<T> = { items: T[]; total: number }

describe.skipIf(!url)('shared devices and PIN sign-in', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())

  let owner: Person
  let waiter: Person
  let abujaStaff: Person
  let otherOwner: Person
  let koraId: string
  let victoriaIsland: Property
  let abuja: Property
  let deviceCookie: string
  let device: DeviceView

  const cookieFrom = (response: Response, name: string) =>
    response.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${name}=`))
      ?.split(';')[0] ?? ''

  // Calls an oRPC procedure with an explicit cookie header (session and/or device).
  const rpcRaw = async <T>(cookie: string, path: string, input: unknown = {}) => {
    const response = await t.call(`/rpc/${path}`, { cookie, body: { json: input } })
    const body = (await response.json()) as { json: T & { message?: string } }
    return { status: response.status, data: body.json, response }
  }
  const memberIdOf = async (person: Person) =>
    (await t.rpc<{ member: { id: string } }>(person.cookie, 'organization/current')).data.member.id
  const pinSignIn = (memberId: string, pin: string, cookie = deviceCookie) =>
    t.call('/api/auth/device/pin-sign-in', { cookie, body: { memberId, pin } })

  beforeAll(async () => {
    owner = await t.signUp('Tunde Alabi')
    koraId = await t.createOrganization(owner.cookie, 'Kora Hotels Group')
    const entity = (await t.rpc<Entity>(owner.cookie, 'entities/create', { name: 'Kora Ltd' })).data
    victoriaIsland = (
      await t.rpc<Property>(owner.cookie, 'properties/create', {
        entityId: entity.id,
        name: 'Kora Victoria Island',
      })
    ).data
    abuja = (
      await t.rpc<Property>(owner.cookie, 'properties/create', {
        entityId: entity.id,
        name: 'Kora Abuja',
        ...ABUJA_ADDRESS,
      })
    ).data
    waiter = await t.signUp('Musa Ibrahim')
    await t.addMember(koraId, waiter, 'waiter')
    await t.rpc(owner.cookie, 'members/setPropertyAccess', {
      memberId: await memberIdOf(waiter),
      allProperties: false,
      propertyIds: [victoriaIsland.id],
    })
    abujaStaff = await t.signUp('Halima Bello')
    await t.addMember(koraId, abujaStaff, 'cashier')
    await t.rpc(owner.cookie, 'members/setPropertyAccess', {
      memberId: await memberIdOf(abujaStaff),
      allProperties: false,
      propertyIds: [abuja.id],
    })
    otherOwner = await t.signUp('Other Owner')
    await t.createOrganization(otherOwner.cookie, 'Another Group')

    for (const [person, pin] of [
      [waiter, '2948'],
      [abujaStaff, '5172'],
      [owner, '8391'],
    ] as const) {
      const set = await t.rpc(person.cookie, 'pins/set', { pin, password: PASSWORD })
      expect(set.status).toBe(200)
    }
  })

  it('registers this browser as a device with a secret, httpOnly cookie', async () => {
    const registered = await rpcRaw<DeviceView>(owner.cookie, 'devices/register', {
      name: 'POS-VI-03',
      kind: 'pos',
      propertyId: victoriaIsland.id,
    })
    expect(registered.status).toBe(200)
    device = registered.data
    const setCookie = registered.response.headers.getSetCookie().join('\n')
    expect(setCookie).toMatch(/vento_device=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict/)
    deviceCookie = cookieFrom(registered.response, 'vento_device')

    const list = await rpcRaw<Page<DeviceView>>(`${owner.cookie}; ${deviceCookie}`, 'devices/list')
    expect(list.data.items[0]).toMatchObject({ name: 'POS-VI-03', isThisDevice: true })

    const duplicate = await t.rpc(owner.cookie, 'devices/register', {
      name: 'POS-VI-03',
      kind: 'pos',
      propertyId: victoriaIsland.id,
    })
    expect(duplicate.status).toBe(409)
  })

  it('shows the lock screen only on a registered device, with the people of its hotel', async () => {
    const none = await rpcRaw<LockScreen>('', 'devices/lockScreen')
    expect(none.data).toEqual({ status: 'unregistered' })
    const lock = await rpcRaw<LockScreen>(deviceCookie, 'devices/lockScreen')
    expect(lock.data.status).toBe('ready')
    if (lock.data.status !== 'ready') return
    expect(lock.data.device).toEqual({
      name: 'POS-VI-03',
      kind: 'pos',
      propertyName: 'Kora Victoria Island',
    })
    // Musa (VI) and the owner (whole group), not Halima (Abuja only).
    expect(lock.data.people.map((p) => p.displayName).sort()).toEqual(['Musa I.', 'Tunde A.'])
  })

  it('refuses obvious PINs, and needs your password to set one', async () => {
    expect(
      (await t.rpc(waiter.cookie, 'pins/set', { pin: '1234', password: PASSWORD })).status,
    ).toBe(400)
    const wrongPassword = await t.rpc(waiter.cookie, 'pins/set', {
      pin: '2948',
      password: 'Not-my-password-1!',
    })
    expect(wrongPassword.status).toBe(400)
    expect(wrongPassword.data.message).toBe("That password isn't right")
  })

  it('signs in with a PIN into a session confined to the device’s hotel', async () => {
    const owners = await pinSignIn(await memberIdOf(owner), '8391')
    expect(owners.status).toBe(200)
    const session = cookieFrom(owners, 'better-auth.session_token')
    expect(session).not.toBe('')
    const pinCookie = `${session}; ${deviceCookie}`

    // The owner sees every hotel with a password, but only this device's hotel with a PIN…
    const hotels = await rpcRaw<Page<Property>>(pinCookie, 'properties/list')
    expect(hotels.data.items.map((p) => p.name)).toEqual(['Kora Victoria Island'])
    // …and can't manage people, permissions or devices from a shared device.
    expect((await rpcRaw(pinCookie, 'members/list')).status).toBe(403)
    expect((await rpcRaw(pinCookie, 'devices/list')).status).toBe(403)
    expect((await rpcRaw(pinCookie, 'pins/set', { pin: '3816', password: PASSWORD })).status).toBe(
      403,
    )
    const current = await rpcRaw<{ device: { name: string; idleSeconds: number } | null }>(
      pinCookie,
      'organization/current',
    )
    expect(current.data.device).toMatchObject({ name: 'POS-VI-03', idleSeconds: 90 })
  })

  it("doesn't let someone from another hotel sign in on this device", async () => {
    const response = await pinSignIn(await memberIdOf(abujaStaff), '5172')
    expect(response.status).toBe(403)
    expect(((await response.json()) as { code: string }).code).toBe('CANT_SIGN_IN_HERE')
  })

  it('locks a PIN for 15 minutes after five wrong tries, even for the right PIN', async () => {
    const musa = await memberIdOf(waiter)
    const first = await pinSignIn(musa, '0000')
    expect(first.status).toBe(401)
    expect(await first.json()).toMatchObject({ code: 'WRONG_PIN', triesLeft: 4 })
    for (let i = 0; i < 3; i++) await pinSignIn(musa, '0000')
    const fifth = await pinSignIn(musa, '0000')
    expect(await fifth.json()).toMatchObject({ code: 'PIN_LOCKED' })
    const right = await pinSignIn(musa, '2948')
    expect(right.status).toBe(403)
    expect(await right.json()).toMatchObject({ code: 'PIN_LOCKED' })

    // A manager's reset clears it; Musa sets a new PIN and drops off the lock screen until then.
    await t.rpc(owner.cookie, 'pins/reset', { memberId: musa })
    const lock = await rpcRaw<LockScreen>(deviceCookie, 'devices/lockScreen')
    if (lock.data.status === 'ready') {
      expect(lock.data.people.map((p) => p.displayName)).toEqual(['Tunde A.'])
    }
    await t.rpc(waiter.cookie, 'pins/set', { pin: '2948', password: PASSWORD })
    expect((await pinSignIn(musa, '2948')).status).toBe(200)
  })

  describe('server-side guards on PIN sessions', () => {
    const signInOwner = async () => {
      const response = await pinSignIn(await memberIdOf(owner), '8391')
      expect(response.status).toBe(200)
      return cookieFrom(response, 'better-auth.session_token')
    }

    it('only works with the device cookie it was made on', async () => {
      const session = await signInOwner()
      expect((await rpcRaw(`${session}; ${deviceCookie}`, 'properties/list')).status).toBe(200)
      expect((await rpcRaw(session, 'properties/list')).status).toBe(401)
    })

    it('signs out on the server after the device idle time, even if the browser never did', async () => {
      const session = await signInOwner()
      await t.db
        .update(sessions)
        .set({ deviceActiveAt: new Date(Date.now() - 5 * 60 * 1000) })
        .where(isNotNull(sessions.deviceId))
      const response = await rpcRaw(`${session}; ${deviceCookie}`, 'properties/list')
      expect(response.status).toBe(401)
      expect(response.data.message).toBe('Signed out after inactivity')
    })

    it('ends a PIN session after a 12-hour shift, whatever the idle clock says', async () => {
      const session = await signInOwner()
      await t.db
        .update(sessions)
        .set({ createdAt: new Date(Date.now() - 13 * 60 * 60 * 1000), deviceActiveAt: new Date() })
        .where(isNotNull(sessions.deviceId))
      expect((await rpcRaw(`${session}; ${deviceCookie}`, 'properties/list')).status).toBe(401)
    })

    it("can't change the account behind it", async () => {
      const session = await signInOwner()
      const rename = await t.call('/api/auth/update-user', {
        cookie: `${session}; ${deviceCookie}`,
        body: { name: 'Someone else' },
      })
      expect(rename.status).toBe(403)
    })
  })

  it('needs a manager reset after three lockouts', async () => {
    const person = await t.signUp('Grace Okon')
    await t.addMember(koraId, person, 'room_attendant')
    await t.rpc(owner.cookie, 'members/setPropertyAccess', {
      memberId: await memberIdOf(person),
      allProperties: false,
      propertyIds: [victoriaIsland.id],
    })
    await t.rpc(person.cookie, 'pins/set', { pin: '4826', password: PASSWORD })
    const grace = await memberIdOf(person)
    for (let lock = 0; lock < 3; lock++) {
      for (let i = 0; i < 5; i++) await pinSignIn(grace, '0000')
      // Skip the 15-minute wait between lockouts.
      await t.db.update(memberPins).set({ lockedUntil: null }).where(eq(memberPins.memberId, grace))
    }
    const right = await pinSignIn(grace, '4826')
    expect(await right.json()).toMatchObject({ code: 'PIN_NEEDS_RESET' })
    await t.rpc(owner.cookie, 'pins/reset', { memberId: grace })
    await t.rpc(person.cookie, 'pins/set', { pin: '4826', password: PASSWORD })
    expect((await pinSignIn(grace, '4826')).status).toBe(200)
  })

  it('lets a manager reset only the PINs of people they manage', async () => {
    await t.rpc(owner.cookie, 'permissions/set', {
      role: 'general_manager',
      permission: 'setup.manage',
      allowed: true,
      reason: 'GMs run their hotel',
    })
    const gm = await t.signUp('Abuja Manager')
    await t.addMember(koraId, gm, 'general_manager')
    await t.rpc(owner.cookie, 'members/setPropertyAccess', {
      memberId: await memberIdOf(gm),
      allProperties: false,
      propertyIds: [abuja.id],
    })
    const reset = (memberId: string) => t.rpc(gm.cookie, 'pins/reset', { memberId })
    expect((await reset(await memberIdOf(owner))).status).toBe(404)
    expect((await reset(await memberIdOf(waiter))).status).toBe(404)
    expect((await reset(await memberIdOf(abujaStaff))).status).toBe(200)
    await t.rpc(owner.cookie, 'permissions/set', {
      role: 'general_manager',
      permission: 'setup.manage',
      allowed: false,
      reason: 'Back to the default',
    })
  })

  it('keeps devices inside their group', async () => {
    const rename = await t.rpc(otherOwner.cookie, 'devices/rename', {
      id: device.id,
      name: 'Mine now',
    })
    expect(rename.status).toBe(404)
    const revoke = await t.rpc(otherOwner.cookie, 'devices/revoke', {
      id: device.id,
      reason: 'mine',
    })
    expect(revoke.status).toBe(404)
  })

  it('revoking a device ends its sessions and stops its lock screen', async () => {
    const signedIn = await pinSignIn(await memberIdOf(owner), '8391')
    const pinCookie = `${cookieFrom(signedIn, 'better-auth.session_token')}; ${deviceCookie}`
    expect((await rpcRaw(pinCookie, 'properties/list')).status).toBe(200)

    const revoked = await t.rpc(owner.cookie, 'devices/revoke', {
      id: device.id,
      reason: 'Tablet stolen from the bar',
    })
    expect(revoked.status).toBe(200)
    expect((await rpcRaw(pinCookie, 'properties/list')).status).toBe(401)
    expect((await rpcRaw<LockScreen>(deviceCookie, 'devices/lockScreen')).data).toEqual({
      status: 'revoked',
      organizationName: 'Kora Hotels Group',
    })
    const again = await pinSignIn(await memberIdOf(owner), '8391')
    expect(await again.json()).toMatchObject({ code: 'DEVICE_REVOKED' })
  })
})
