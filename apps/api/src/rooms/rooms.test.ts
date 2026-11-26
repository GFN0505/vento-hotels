// Rooms on the real test database through the real HTTP flow
// (spec: docs/specs/stage-1-room-types-and-rooms.md).
import type {
  AuditEventView,
  RoomDetail,
  RoomsSummary,
  RoomTypeView,
  RoomView,
} from '@vento/shared'
import { newId } from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditEvents } from '../db/schema/governance.ts'
import { createTestApp, PASSWORD } from '../test/harness.ts'
import {
  createType,
  floorRooms,
  koraWithRooms,
  type Page,
  type Problem,
  setLive,
} from './testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('rooms', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let kora: Awaited<ReturnType<typeof koraWithRooms>>
  let deluxe: RoomTypeView
  let suite: RoomTypeView
  const batchId = newId()

  const rooms = async (input: Record<string, unknown>, cookie = kora.gm.cookie) =>
    (await t.rpc<Page<RoomView>>(cookie, 'rooms/list', { propertyId: kora.vi.id, ...input })).data
  const roomByNumber = async (number: string) => {
    const page = await rooms({ q: number })
    const found = page.items.find((room) => room.number === number)
    if (!found) throw new Error(`no room ${number}`)
    return found
  }
  const lastEvent = async (entityId: string) =>
    (
      await t.rpc<Page<AuditEventView>>(kora.owner.cookie, 'audit/list', {
        entityType: 'room',
        entityId,
      })
    ).data.items[0]

  beforeAll(async () => {
    kora = await koraWithRooms(t)
    deluxe = await createType(t, kora.gm.cookie, kora.vi.id, { name: 'Deluxe King', code: 'DLK' })
    suite = await createType(t, kora.gm.cookie, kora.vi.id, { name: 'Junior Suite', code: 'JRS' })
  })

  describe('who can set up rooms', () => {
    it('says the module is off for a group without front desk', async () => {
      const person = await t.signUp('No Front Desk')
      await t.createOrganization(person.cookie, 'Switched Off Group')
      const response = await t.rpc<Problem>(person.cookie, 'rooms/list', { propertyId: newId() })
      expect(response.status).toBe(403)
      expect(response.data.data?.code).toBe('FEATURE_OFF')
    })

    it('refuses front desk with who to ask', async () => {
      const response = await t.rpc<Problem>(kora.frontDesk.cookie, 'rooms/list', {
        propertyId: kora.vi.id,
      })
      expect(response.status).toBe(403)
      expect(response.data.message).toBe('Only a GM or the owner can set up rooms. Ask your GM.')
    })

    it('refuses a PIN session on a shared device, even for the owner', async () => {
      const cookieNamed = (response: Response, name: string) =>
        response.headers
          .getSetCookie()
          .find((c) => c.startsWith(`${name}=`))
          ?.split(';')[0] ?? ''
      const registered = await t.call('/rpc/devices/register', {
        cookie: kora.owner.cookie,
        body: { json: { name: 'FD-VI-01', kind: 'front_desk', propertyId: kora.vi.id } },
      })
      const device = cookieNamed(registered, 'vento_device')
      await t.rpc(kora.owner.cookie, 'pins/set', { pin: '8391', password: PASSWORD })
      const me = await t.rpc<{ member: { id: string } }>(kora.owner.cookie, 'organization/current')
      const signIn = await t.call('/api/auth/device/pin-sign-in', {
        cookie: device,
        body: { memberId: me.data.member.id, pin: '8391' },
      })
      expect(signIn.status).toBe(200)
      const pinCookie = `${cookieNamed(signIn, 'better-auth.session_token')}; ${device}`
      const response = await t.rpc(pinCookie, 'rooms/list', { propertyId: kora.vi.id })
      expect(response.status).toBe(403)
    })

    it('follows the owner’s change to the matrix', async () => {
      const set = (allowed: boolean) =>
        t.rpc(kora.owner.cookie, 'permissions/set', {
          role: 'general_manager',
          permission: 'rooms.setup',
          allowed,
          reason: 'Rooms are set up by head office',
        })
      await set(false)
      expect((await t.rpc(kora.gm.cookie, 'rooms/list', { propertyId: kora.vi.id })).status).toBe(
        403,
      )
      await set(true)
      expect((await t.rpc(kora.gm.cookie, 'rooms/list', { propertyId: kora.vi.id })).status).toBe(
        200,
      )
    })
  })

  describe('Add rooms by floor', () => {
    it('creates every room in one go, dirty and vacant, with one audit event each', async () => {
      const batch = [
        ...floorRooms(deluxe.id, 10, 1, 14),
        ...floorRooms(suite.id, 11, 1, 8),
        ...floorRooms(deluxe.id, 4, 1, 14),
      ]
      const response = await t.rpc<{ created: number }>(kora.gm.cookie, 'rooms/createMany', {
        propertyId: kora.vi.id,
        batchId,
        rooms: batch,
      })
      expect(response.data).toEqual({ created: 36, batchId })
      const [row] = await t.db
        .select({ value: sql<number>`count(*)::int` })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.action, 'room.created'),
            sql`${auditEvents.after}->>'batchId' = ${batchId}`,
            eq(auditEvents.businessDate, kora.vi.businessDate),
          ),
        )
      expect(row?.value).toBe(36)
    })

    it('sorts by floor then number, so 1014 comes before 1101', async () => {
      const page = await rooms({ pageSize: 100 })
      const numbers = page.items.map((room) => room.number)
      expect(numbers.indexOf('1014')).toBe(numbers.indexOf('1101') - 1)
      expect(numbers[0]).toBe('401')
      expect(page.items[0]).toMatchObject({
        roomTypeName: 'Deluxe King',
        frontOfficeStatus: 'vacant',
        housekeepingStatus: 'dirty',
      })
    })

    it('refuses more than 500 rooms and the same number twice', async () => {
      const tooMany = await t.rpc(kora.gm.cookie, 'rooms/createMany', {
        propertyId: kora.vi.id,
        batchId: newId(),
        rooms: Array.from({ length: 501 }, (_, i) => ({
          number: `X${i}`,
          floor: 1,
          roomTypeId: deluxe.id,
        })),
      })
      expect(tooMany.status).toBe(400)
      const twice = await t.rpc<Problem>(kora.gm.cookie, 'rooms/createMany', {
        propertyId: kora.vi.id,
        batchId: newId(),
        rooms: [...floorRooms(deluxe.id, 6, 1, 5), ...floorRooms(deluxe.id, 6, 5, 6)],
      })
      expect(twice.data).toMatchObject({
        message: 'Room 605 is in the list twice.',
        data: { code: 'DUPLICATE_NUMBERS' },
      })
    })

    it('saves nothing from a batch with a number the hotel already has', async () => {
      const clash = await t.rpc<Problem>(kora.gm.cookie, 'rooms/createMany', {
        propertyId: kora.vi.id,
        batchId: newId(),
        rooms: floorRooms(deluxe.id, 4, 10, 16),
      })
      expect(clash.status).toBe(409)
      expect(clash.data.data).toMatchObject({ code: 'ROOM_NUMBER_TAKEN' })
      expect(clash.data.message).toBe('Rooms 410, 411, 412 and 2 more already exist.')
      expect((await rooms({ q: '415' })).total).toBe(0)
    })

    it('lets only one of two people adding room 712 at once succeed', async () => {
      const add = (from: number, to: number) =>
        t.rpc(kora.gm.cookie, 'rooms/createMany', {
          propertyId: kora.vi.id,
          batchId: newId(),
          rooms: floorRooms(deluxe.id, 7, from, to),
        })
      const results = await Promise.all([add(1, 12), add(12, 14)])
      expect(results.map((r) => r.status).sort()).toEqual([200, 409])
      expect((await rooms({ floor: 7 })).total).toBe(results[0]?.status === 200 ? 12 : 3)
    })

    it('tells the builder which numbers exist, archived ones marked', async () => {
      const checked = await t.rpc<{ taken: unknown[] }>(kora.gm.cookie, 'rooms/checkNumbers', {
        propertyId: kora.vi.id,
        numbers: ['401', '499', '1101'],
      })
      expect(checked.data.taken).toEqual([
        { number: '401', archived: false },
        { number: '1101', archived: false },
      ])
    })
  })

  describe('one room', () => {
    it('adds a room and refuses its number again', async () => {
      const created = await t.rpc<RoomDetail>(kora.gm.cookie, 'rooms/create', {
        propertyId: kora.vi.id,
        number: 'ph-1',
        floor: 12,
        roomTypeId: suite.id,
        features: ['Ocean view'],
        accessible: true,
      })
      expect(created.data).toMatchObject({ number: 'PH-1', accessible: true, canDelete: false })
      expect((await lastEvent(created.data.id))?.action).toBe('room.created')
      const again = await t.rpc<Problem>(kora.gm.cookie, 'rooms/create', {
        propertyId: kora.vi.id,
        number: 'PH-1',
        floor: 12,
        roomTypeId: suite.id,
      })
      expect(again.data).toMatchObject({
        message: 'Room PH-1 already exists.',
        data: { code: 'ROOM_NUMBER_TAKEN' },
      })
    })

    it('connects 401 and 402 both ways, and audits both rooms', async () => {
      const r401 = await roomByNumber('401')
      const r402 = await roomByNumber('402')
      const saved = await t.rpc<RoomDetail>(kora.gm.cookie, 'rooms/update', {
        id: r401.id,
        features: ['City view'],
        connectingRoomIds: [r402.id],
      })
      expect(saved.data.connectingRooms).toEqual([{ id: r402.id, number: '402' }])
      expect((await roomByNumber('402')).connectingRooms).toEqual([{ id: r401.id, number: '401' }])
      expect(await lastEvent(r401.id)).toMatchObject({
        action: 'room.changed',
        before: { features: [], connectingRooms: [] },
        after: { features: ['City view'], connectingRooms: ['402'] },
      })
      expect(await lastEvent(r402.id)).toMatchObject({
        action: 'room.changed',
        after: { connectingRooms: ['401'] },
      })
    })

    it('renumbers a room without a reason, and refuses a number in use', async () => {
      const room = await roomByNumber('414')
      const taken = await t.rpc<Problem>(kora.gm.cookie, 'rooms/update', {
        id: room.id,
        number: '413',
      })
      expect(taken.status).toBe(409)
      const moved = await t.rpc<RoomDetail>(kora.gm.cookie, 'rooms/update', {
        id: room.id,
        number: '414A',
        floor: 4,
      })
      expect(moved.data.number).toBe('414A')
    })
  })

  describe('remove, restore and delete', () => {
    it('archives a room, drops its connections, and blocks its number', async () => {
      const r401 = await roomByNumber('401')
      const archived = await t.rpc<{ count: number }>(kora.gm.cookie, 'rooms/archive', {
        propertyId: kora.vi.id,
        ids: [r401.id],
      })
      expect(archived.data.count).toBe(1)
      expect((await roomByNumber('402')).connectingRooms).toEqual([])
      expect(await lastEvent(r401.id)).toMatchObject({
        action: 'room.archived',
        after: { number: '401', roomTypeName: 'Deluxe King', liveProperty: false },
      })
      const reuse = await t.rpc<Problem>(kora.gm.cookie, 'rooms/create', {
        propertyId: kora.vi.id,
        number: '401',
        floor: 4,
        roomTypeId: deluxe.id,
      })
      expect(reuse.data.message).toBe(
        'Room 401 is archived. Restore it, or delete it for good if it was a mistake.',
      )
      expect((await rooms({ archived: true })).items.map((r) => r.number)).toEqual(['401'])
    })

    it('restores a room into its type', async () => {
      const r401 = (await rooms({ archived: true })).items[0]
      const restored = await t.rpc<{ count: number }>(kora.gm.cookie, 'rooms/restore', {
        propertyId: kora.vi.id,
        ids: [r401?.id],
      })
      expect(restored.data.count).toBe(1)
      expect((await lastEvent(r401?.id ?? ''))?.action).toBe('room.restored')
    })

    it('deletes only archived rooms, which frees the number', async () => {
      const room = await roomByNumber('PH-1')
      const active = await t.rpc<Problem>(kora.gm.cookie, 'rooms/delete', { id: room.id })
      expect(active.data.data?.code).toBe('NOT_ARCHIVED')
      await t.rpc(kora.gm.cookie, 'rooms/archive', { propertyId: kora.vi.id, ids: [room.id] })
      const detail = await t.rpc<RoomDetail>(kora.gm.cookie, 'rooms/get', { id: room.id })
      expect(detail.data.canDelete).toBe(true)
      expect((await t.rpc(kora.gm.cookie, 'rooms/delete', { id: room.id })).status).toBe(200)
      expect(await lastEvent(room.id)).toMatchObject({
        action: 'room.deleted',
        before: { number: 'PH-1', accessible: true },
      })
      const free = await t.rpc(kora.gm.cookie, 'rooms/checkNumbers', {
        propertyId: kora.vi.id,
        numbers: ['PH-1'],
      })
      expect(free.data).toEqual({ taken: [] })
    })

    it('moves rooms to another type', async () => {
      const rooms1101 = await roomByNumber('1101')
      const moved = await t.rpc<{ count: number }>(kora.gm.cookie, 'rooms/changeType', {
        propertyId: kora.vi.id,
        ids: [rooms1101.id],
        roomTypeId: deluxe.id,
      })
      expect(moved.data.count).toBe(1)
      expect(await lastEvent(rooms1101.id)).toMatchObject({
        before: { roomTypeId: suite.id, roomTypeName: 'Junior Suite' },
        after: { roomTypeId: deluxe.id, roomTypeName: 'Deluxe King', liveProperty: false },
      })
    })
  })

  describe('after go-live', () => {
    beforeAll(() => setLive(t, kora.vi.id, '2026-11-01'))
    afterAll(() => setLive(t, kora.vi.id, null))

    it('asks for a reason to remove, restore or move a room, and writes nothing without one', async () => {
      const room = await roomByNumber('402')
      const before = await lastEvent(room.id)
      for (const [path, extra] of [
        ['rooms/archive', {}],
        ['rooms/restore', {}],
        ['rooms/changeType', { roomTypeId: suite.id }],
      ] as const) {
        const response = await t.rpc<Problem>(kora.gm.cookie, path, {
          propertyId: kora.vi.id,
          ids: [room.id],
          ...extra,
        })
        expect(response.data.data?.code).toBe('REASON_REQUIRED')
      }
      expect((await lastEvent(room.id))?.id).toBe(before?.id)
      const archived = await t.rpc(kora.gm.cookie, 'rooms/archive', {
        propertyId: kora.vi.id,
        ids: [room.id],
        reason: 'Converted to a store',
      })
      expect(archived.status).toBe(200)
      expect(await lastEvent(room.id)).toMatchObject({
        action: 'room.archived',
        actorName: 'Tunde Bello',
        reason: 'Converted to a store',
        after: { liveProperty: true },
      })
    })

    it('needs no reason to change features or the floor', async () => {
      const room = await roomByNumber('403')
      const saved = await t.rpc(kora.gm.cookie, 'rooms/update', { id: room.id, floor: 3 })
      expect(saved.status).toBe(200)
    })

    it('stops Mark inspected once the hotel is live', async () => {
      const response = await t.rpc<Problem>(kora.gm.cookie, 'rooms/markInspected', {
        propertyId: kora.vi.id,
      })
      expect(response.data.data?.code).toBe('PROPERTY_LIVE')
    })
  })

  describe('Mark inspected', () => {
    it('marks every dirty room inspected, and undo puts back only that batch', async () => {
      const summary = async () =>
        (
          await t.rpc<RoomsSummary>(kora.gm.cookie, 'rooms/summary', {
            propertyId: kora.vi.id,
          })
        ).data
      expect(await summary()).toMatchObject({ allDirtySetup: true, live: false, outOfOrder: 0 })
      const marked = await t.rpc<{ count: number; batchId: string }>(
        kora.gm.cookie,
        'rooms/markInspected',
        { propertyId: kora.vi.id },
      )
      const active = (await summary()).active
      expect(marked.data.count).toBe(active)
      expect((await summary()).allDirtySetup).toBe(false)
      const room = await roomByNumber('1001')
      expect(await lastEvent(room.id)).toMatchObject({
        action: 'room.status_changed',
        reason: 'Set up',
        after: { housekeepingStatus: 'inspected', batchId: marked.data.batchId },
      })
      const undone = await t.rpc<{ count: number }>(kora.gm.cookie, 'rooms/undoMarkInspected', {
        propertyId: kora.vi.id,
        batchId: marked.data.batchId,
      })
      expect(undone.data.count).toBe(active)
      expect((await summary()).allDirtySetup).toBe(true)
    })

    it('summarises floors, features and accessible rooms', async () => {
      const summary = await t.rpc<RoomsSummary>(kora.gm.cookie, 'rooms/summary', {
        propertyId: kora.vi.id,
      })
      expect(summary.data.features).toContain('City view')
      expect(summary.data.floors).toEqual([...summary.data.floors].sort((a, b) => a - b))
      expect(summary.data.floors).toContain(11)
    })
  })

  describe('isolation and scoping', () => {
    it('returns NOT_FOUND for another group’s room and hotel', async () => {
      const theirType = await createType(t, kora.outsider.cookie, kora.otherHotel.id)
      const theirs = await t.rpc<RoomDetail>(kora.outsider.cookie, 'rooms/create', {
        propertyId: kora.otherHotel.id,
        number: '101',
        floor: 1,
        roomTypeId: theirType.id,
      })
      for (const [path, input] of [
        ['rooms/get', { id: theirs.data.id }],
        ['rooms/update', { id: theirs.data.id, floor: 2 }],
        ['rooms/delete', { id: theirs.data.id }],
        ['rooms/archive', { propertyId: kora.otherHotel.id, ids: [theirs.data.id] }],
        ['rooms/list', { propertyId: kora.otherHotel.id }],
      ] as const) {
        expect((await t.rpc(kora.owner.cookie, path, input)).status).toBe(404)
      }
      // Naming our own hotel doesn't reach their room either.
      const archive = await t.rpc(kora.owner.cookie, 'rooms/archive', {
        propertyId: kora.vi.id,
        ids: [theirs.data.id],
      })
      expect(archive.status).toBe(404)
    })

    it('keeps the Victoria Island GM out of Abuja, and Abuja rooms out of VI connections', async () => {
      const abujaType = await createType(t, kora.owner.cookie, kora.abuja.id)
      const abujaRoom = await t.rpc<RoomDetail>(kora.owner.cookie, 'rooms/create', {
        propertyId: kora.abuja.id,
        number: '201',
        floor: 2,
        roomTypeId: abujaType.id,
      })
      expect((await t.rpc(kora.gm.cookie, 'rooms/get', { id: abujaRoom.data.id })).status).toBe(404)
      expect(
        (await t.rpc(kora.gm.cookie, 'rooms/list', { propertyId: kora.abuja.id })).status,
      ).toBe(404)
      const r403 = await roomByNumber('403')
      const link = await t.rpc(kora.owner.cookie, 'rooms/update', {
        id: r403.id,
        connectingRoomIds: [abujaRoom.data.id],
      })
      expect(link.status).toBe(404)
      const typeFromAbuja = await t.rpc(kora.owner.cookie, 'rooms/create', {
        propertyId: kora.vi.id,
        number: '999',
        floor: 9,
        roomTypeId: abujaType.id,
      })
      expect(typeFromAbuja.status).toBe(404)
    })
  })
})
