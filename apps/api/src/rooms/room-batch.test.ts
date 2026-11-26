// "Add rooms by floor" with new room types, "select all" ids, and the database's tenancy keys
// (spec: docs/specs/stage-1-room-types-and-rooms.md).
import type {
  AuditEventView,
  CreateManyRoomsResult,
  RoomIds,
  RoomTypeView,
  RoomView,
} from '@vento/shared'
import { newId } from '@vento/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { roomTypes } from '../db/schema/rooms.ts'
import { createTestApp } from '../test/harness.ts'
import { createType, floorRooms, koraWithRooms, type Page, type Problem } from './testing.ts'

const url = process.env.TEST_DATABASE_URL

const newType = (key: string, name: string, code: string) => ({
  key,
  name,
  code,
  bed: 'king',
  maxAdults: 2,
  maxChildren: 1,
})

describe.skipIf(!url)('rooms in one go, with new types', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let kora: Awaited<ReturnType<typeof koraWithRooms>>
  let standard: RoomTypeView

  const types = async () =>
    (
      await t.rpc<Page<RoomTypeView>>(kora.gm.cookie, 'roomTypes/list', {
        propertyId: kora.vi.id,
      })
    ).data.items
  const byKey = (floor: number, key: string, from = 1, to = 4) =>
    floorRooms('', floor, from, to).map(({ number, floor: f }) => ({
      number,
      floor: f,
      roomTypeKey: key,
    }))

  beforeAll(async () => {
    kora = await koraWithRooms(t)
    standard = await createType(t, kora.gm.cookie, kora.vi.id, { name: 'Standard Queen' })
  })

  describe('new types in the same transaction', () => {
    const batchId = newId()
    const request = () => ({
      propertyId: kora.vi.id,
      batchId,
      newTypes: [newType('dlk', 'Deluxe King', 'DLK'), newType('jrs', 'Junior Suite', 'JRS')],
      rooms: [...floorRooms(standard.id, 3, 1, 4), ...byKey(4, 'dlk'), ...byKey(11, 'jrs', 1, 2)],
    })
    let first: CreateManyRoomsResult

    it('creates the new types and every room together, and says which id each key got', async () => {
      const response = await t.rpc<CreateManyRoomsResult>(
        kora.gm.cookie,
        'rooms/createMany',
        request(),
      )
      expect(response.status).toBe(200)
      first = response.data
      expect(first.created).toBe(10)
      expect(first.roomTypes.map((type) => type.key).sort()).toEqual(['dlk', 'jrs'])
      const list = await types()
      const deluxe = list.find((type) => type.code === 'DLK')
      expect(deluxe).toMatchObject({
        id: first.roomTypes.find((type) => type.key === 'dlk')?.id,
        roomCount: 4,
        maxGuests: 3,
      })
      const events = await t.rpc<Page<AuditEventView>>(kora.owner.cookie, 'audit/list', {
        entityType: 'room_type',
        entityId: deluxe?.id,
      })
      expect(events.data.items[0]).toMatchObject({
        action: 'room_type.created',
        after: { name: 'Deluxe King', batchId, key: 'dlk', liveProperty: false },
      })
    })

    it('answers the same request again with the original result, creating nothing', async () => {
      const again = await t.rpc<CreateManyRoomsResult>(
        kora.gm.cookie,
        'rooms/createMany',
        request(),
      )
      expect(again.status).toBe(200)
      expect(again.data.created).toBe(first.created)
      expect(again.data.roomTypes.sort((a, b) => a.key.localeCompare(b.key))).toEqual(
        [...first.roomTypes].sort((a, b) => a.key.localeCompare(b.key)),
      )
      expect((await types()).length).toBe(3)
    })
  })

  it('answers two copies of the same request sent at once with one result', async () => {
    const request = {
      propertyId: kora.vi.id,
      batchId: newId(),
      newTypes: [newType('exk', 'Executive King', 'EXK')],
      rooms: byKey(5, 'exk', 1, 14),
    }
    const results = await Promise.all([
      t.rpc<CreateManyRoomsResult>(kora.gm.cookie, 'rooms/createMany', request),
      t.rpc<CreateManyRoomsResult>(kora.gm.cookie, 'rooms/createMany', request),
    ])
    expect(results.map((r) => r.status)).toEqual([200, 200])
    expect(results[0]?.data.roomTypes).toEqual(results[1]?.data.roomTypes)
    expect((await types()).filter((type) => type.code === 'EXK')).toHaveLength(1)
  })

  it('saves neither the new type nor any room when a number is taken', async () => {
    const response = await t.rpc<Problem>(kora.gm.cookie, 'rooms/createMany', {
      propertyId: kora.vi.id,
      batchId: newId(),
      newTypes: [newType('pent', 'Penthouse', 'PEN')],
      rooms: byKey(4, 'pent', 4, 6),
    })
    expect(response.data.data?.code).toBe('ROOM_NUMBER_TAKEN')
    expect((await types()).map((type) => type.code)).not.toContain('PEN')
  })

  it('says which new type clashes with one the hotel has, and saves nothing', async () => {
    const response = await t.rpc<Problem & { data: { key?: string } }>(
      kora.gm.cookie,
      'rooms/createMany',
      {
        propertyId: kora.vi.id,
        batchId: newId(),
        newTypes: [newType('gar', 'Garden Room', 'GAR'), newType('dup', 'deluxe king', 'DK2')],
        rooms: [...byKey(6, 'gar'), ...byKey(7, 'dup')],
      },
    )
    expect(response.status).toBe(409)
    expect(response.data).toMatchObject({
      message: 'Deluxe King already exists at this hotel.',
      data: { code: 'TYPE_NAME_TAKEN', key: 'dup' },
    })
    expect((await types()).map((type) => type.code)).not.toContain('GAR')
  })

  it('refuses the same new type twice, and a room pointing at a key that isn’t there', async () => {
    const twice = await t.rpc<Problem & { data: { key?: string } }>(
      kora.gm.cookie,
      'rooms/createMany',
      {
        propertyId: kora.vi.id,
        batchId: newId(),
        newTypes: [newType('a', 'Twin Room', 'TWN'), newType('b', 'Twin room', 'TW2')],
        rooms: byKey(8, 'a'),
      },
    )
    expect(twice.data).toMatchObject({
      message: 'Twin room is in the list twice.',
      data: { code: 'TYPE_NAME_TAKEN', key: 'b' },
    })
    const unknown = await t.rpc(kora.gm.cookie, 'rooms/createMany', {
      propertyId: kora.vi.id,
      batchId: newId(),
      rooms: byKey(8, 'nowhere'),
    })
    expect(unknown.status).toBe(400)
  })

  describe('select all rooms in a view', () => {
    it('gives every matching id in list order, with the total', async () => {
      const filter = { propertyId: kora.vi.id, floor: 5 }
      const ids = await t.rpc<RoomIds>(kora.gm.cookie, 'rooms/listIds', filter)
      const list = await t.rpc<Page<RoomView>>(kora.gm.cookie, 'rooms/list', filter)
      expect(ids.data).toEqual({ ids: list.data.items.map((room) => room.id), total: 14 })
      const archived = await t.rpc<RoomIds>(kora.gm.cookie, 'rooms/listIds', {
        propertyId: kora.vi.id,
        archived: true,
      })
      expect(archived.data).toEqual({ ids: [], total: 0 })
    })

    it('stops at the 500-room bulk limit and still says how many match', async () => {
      const floors = Array.from({ length: 37 }, (_, i) => 20 + i)
      const many = floors.flatMap((floor) => floorRooms(standard.id, floor, 1, 14))
      for (const chunk of [many.slice(0, 500), many.slice(500)]) {
        await t.rpc(kora.gm.cookie, 'rooms/createMany', {
          propertyId: kora.vi.id,
          batchId: newId(),
          rooms: chunk,
        })
      }
      const ids = await t.rpc<RoomIds>(kora.gm.cookie, 'rooms/listIds', {
        propertyId: kora.vi.id,
        roomTypeId: standard.id,
      })
      expect(ids.data.total).toBe(4 + many.length)
      expect(ids.data.ids).toHaveLength(500)
    })

    it('returns NOT_FOUND for a hotel outside the member’s reach', async () => {
      expect(
        (await t.rpc(kora.gm.cookie, 'rooms/listIds', { propertyId: kora.abuja.id })).status,
      ).toBe(404)
      expect(
        (await t.rpc(kora.owner.cookie, 'rooms/listIds', { propertyId: kora.otherHotel.id }))
          .status,
      ).toBe(404)
    })
  })

  it('has the database refuse a room type that names another group’s hotel', async () => {
    await expect(
      t.db.insert(roomTypes).values({
        organizationId: (
          await t.rpc<{ organization: { id: string } }>(kora.owner.cookie, 'organization/current')
        ).data.organization.id,
        propertyId: kora.otherHotel.id,
        code: 'XX',
        name: 'Smuggled',
        bed: 'king',
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } })
  })
})
