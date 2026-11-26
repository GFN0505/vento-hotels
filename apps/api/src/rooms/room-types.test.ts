// Room types on the real test database through the real HTTP flow
// (spec: docs/specs/stage-1-room-types-and-rooms.md).
import type { AuditEventView, RoomTypeView } from '@vento/shared'
import { newId } from '@vento/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from '../test/harness.ts'
import {
  createType,
  floorRooms,
  koraWithRooms,
  type Page,
  type Problem,
  setLive,
} from './testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('room types', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let kora: Awaited<ReturnType<typeof koraWithRooms>>

  beforeAll(async () => {
    kora = await koraWithRooms(t)
  })

  const list = async (propertyId: string, includeArchived = false) =>
    (
      await t.rpc<Page<RoomTypeView>>(kora.owner.cookie, 'roomTypes/list', {
        propertyId,
        includeArchived,
      })
    ).data

  it('creates a room type with its details and derived max guests', async () => {
    const created = await t.rpc<RoomTypeView>(kora.gm.cookie, 'roomTypes/create', {
      propertyId: kora.vi.id,
      name: 'Deluxe King',
      code: 'dlk',
      bed: 'king',
      baseOccupancy: 2,
      maxAdults: 2,
      maxChildren: 1,
      sizeSqm: '32',
      amenities: ['AC', 'Wi-Fi', 'wi-fi'],
    })
    expect(created.status).toBe(200)
    expect(created.data).toMatchObject({
      code: 'DLK',
      maxGuests: 3,
      sizeSqm: '32.0',
      amenities: ['AC', 'Wi-Fi'],
      roomCount: 0,
      archivedAt: null,
    })
  })

  it('refuses a name or code the hotel already uses, in the spec’s words', async () => {
    const name = await t.rpc<Problem>(kora.gm.cookie, 'roomTypes/create', {
      propertyId: kora.vi.id,
      name: 'deluxe king',
      code: 'DK2',
      bed: 'king',
    })
    expect(name.status).toBe(409)
    expect(name.data.message).toBe('Deluxe King already exists at this hotel.')
    const code = await t.rpc<Problem>(kora.gm.cookie, 'roomTypes/create', {
      propertyId: kora.vi.id,
      name: 'Deluxe Twin',
      code: 'DLK',
      bed: 'twin',
    })
    expect(code.data).toMatchObject({
      message: 'Code DLK is used by Deluxe King.',
      data: { code: 'TYPE_CODE_TAKEN' },
    })
    // Another hotel in the group may use the same name and code.
    expect(
      (await createType(t, kora.owner.cookie, kora.abuja.id, { name: 'Deluxe King', code: 'DLK' }))
        .code,
    ).toBe('DLK')
  })

  it('refuses a base occupancy above max guests, on create and on update', async () => {
    const bad = await t.rpc<Problem>(kora.gm.cookie, 'roomTypes/create', {
      propertyId: kora.vi.id,
      name: 'Single Room',
      code: 'SGL',
      bed: 'single',
      baseOccupancy: 2,
      maxAdults: 1,
    })
    expect(bad.status).toBe(400)
    const type = await createType(t, kora.gm.cookie, kora.vi.id)
    const update = await t.rpc<Problem>(kora.gm.cookie, 'roomTypes/update', {
      id: type.id,
      maxAdults: 1,
    })
    expect(update.data.message).toBe("Base occupancy can't be more than max guests")
  })

  it('records only the changed fields when a type is edited', async () => {
    const type = await createType(t, kora.gm.cookie, kora.vi.id, { sizeSqm: '40' })
    const saved = await t.rpc<RoomTypeView>(kora.gm.cookie, 'roomTypes/update', {
      id: type.id,
      sizeSqm: '40',
      maxChildren: 1,
    })
    expect(saved.data.maxGuests).toBe(3)
    const events = await t.rpc<Page<AuditEventView>>(kora.owner.cookie, 'audit/list', {
      entityType: 'room_type',
      entityId: type.id,
    })
    expect(events.data.items[0]).toMatchObject({
      action: 'room_type.changed',
      actorName: 'Tunde Bello',
      before: { maxChildren: 0 },
      after: { maxChildren: 1, liveProperty: false },
    })
    expect(events.data.items[0]?.before).not.toHaveProperty('sizeSqm')
  })

  it('counts only active rooms, and archives a type only once its rooms are gone', async () => {
    const type = await createType(t, kora.gm.cookie, kora.vi.id, { name: 'Executive King' })
    const added = await t.rpc(kora.gm.cookie, 'rooms/createMany', {
      propertyId: kora.vi.id,
      batchId: newId(),
      rooms: floorRooms(type.id, 5, 1, 3),
    })
    expect(added.status).toBe(200)
    const blocked = await t.rpc<Problem>(kora.gm.cookie, 'roomTypes/archive', { id: type.id })
    expect(blocked.data).toMatchObject({
      message: 'Move or remove the 3 Executive King rooms first.',
      data: { code: 'TYPE_HAS_ROOMS' },
    })
    const ids = (
      await t.rpc<Page<{ id: string }>>(kora.gm.cookie, 'rooms/list', {
        propertyId: kora.vi.id,
        roomTypeId: type.id,
      })
    ).data.items.map((room) => room.id)
    await t.rpc(kora.gm.cookie, 'rooms/archive', { propertyId: kora.vi.id, ids: ids.slice(0, 1) })
    expect((await list(kora.vi.id)).items.find((r) => r.id === type.id)?.roomCount).toBe(2)
    await t.rpc(kora.gm.cookie, 'rooms/archive', { propertyId: kora.vi.id, ids })
    const archived = await t.rpc<RoomTypeView>(kora.gm.cookie, 'roomTypes/archive', { id: type.id })
    expect(archived.data.archivedAt).not.toBeNull()
    expect((await list(kora.vi.id)).items.map((r) => r.id)).not.toContain(type.id)
    expect((await list(kora.vi.id, true)).items.at(-1)?.id).toBe(type.id)
  })

  it('won’t add rooms to an archived type, and restores a type only if its name is free', async () => {
    const type = await createType(t, kora.gm.cookie, kora.vi.id, { name: 'Garden Room' })
    await t.rpc(kora.gm.cookie, 'roomTypes/archive', { id: type.id })
    const add = await t.rpc<Problem>(kora.gm.cookie, 'rooms/create', {
      propertyId: kora.vi.id,
      number: 'G90',
      floor: 0,
      roomTypeId: type.id,
    })
    expect(add.data).toMatchObject({
      message: 'Garden Room is archived. Restore it first.',
      data: { code: 'TYPE_ARCHIVED' },
    })
    await createType(t, kora.gm.cookie, kora.vi.id, { name: 'Garden Room' })
    const restore = await t.rpc<Problem>(kora.gm.cookie, 'roomTypes/restore', { id: type.id })
    expect(restore.data.data?.code).toBe('TYPE_NAME_TAKEN')
  })

  it('reorders the full list of active types, and refuses a stale list', async () => {
    const current = (await list(kora.vi.id)).items.map((r) => r.id)
    const reversed = [...current].reverse()
    const stale = await t.rpc<Problem>(kora.gm.cookie, 'roomTypes/reorder', {
      propertyId: kora.vi.id,
      ids: reversed.slice(1),
    })
    expect(stale.data.data?.code).toBe('LIST_CHANGED')
    const saved = await t.rpc(kora.gm.cookie, 'roomTypes/reorder', {
      propertyId: kora.vi.id,
      ids: reversed,
    })
    expect(saved.status).toBe(200)
    expect((await list(kora.vi.id)).items.map((r) => r.id)).toEqual(reversed)
    const events = await t.rpc<Page<AuditEventView>>(kora.owner.cookie, 'audit/list', {
      entityType: 'room_type',
    })
    expect(events.data.items[0]).toMatchObject({
      action: 'room_types.reordered',
      before: { ids: current },
      after: { ids: reversed },
    })
  })

  it('never leaves an archived type with active rooms when archive and add race', async () => {
    for (let round = 0; round < 3; round++) {
      const type = await createType(t, kora.gm.cookie, kora.vi.id)
      await Promise.allSettled([
        t.rpc(kora.gm.cookie, 'rooms/createMany', {
          propertyId: kora.vi.id,
          batchId: newId(),
          rooms: floorRooms(type.id, 150 + round, 1, 20),
        }),
        t.rpc(kora.gm.cookie, 'roomTypes/archive', { id: type.id }),
      ])
      const after = (await list(kora.vi.id, true)).items.find((r) => r.id === type.id)
      expect(after?.archivedAt === null || after?.roomCount === 0).toBe(true)
    }
  })

  it('returns NOT_FOUND for another group’s type and for a hotel outside the GM’s', async () => {
    const theirs = await createType(t, kora.outsider.cookie, kora.otherHotel.id)
    for (const path of ['roomTypes/get', 'roomTypes/archive', 'roomTypes/update']) {
      expect((await t.rpc(kora.owner.cookie, path, { id: theirs.id })).status).toBe(404)
    }
    const abujaType = await createType(t, kora.owner.cookie, kora.abuja.id)
    expect((await t.rpc(kora.gm.cookie, 'roomTypes/get', { id: abujaType.id })).status).toBe(404)
    const create = await t.rpc(kora.gm.cookie, 'roomTypes/create', {
      propertyId: kora.abuja.id,
      name: 'Sneaky',
      code: 'SNK',
      bed: 'king',
    })
    expect(create.status).toBe(404)
  })

  it('asks for no reason to archive a type, even when live, and records one if given', async () => {
    await setLive(t, kora.abuja.id, '2026-11-01')
    const type = await createType(t, kora.owner.cookie, kora.abuja.id)
    await t.rpc(kora.owner.cookie, 'roomTypes/archive', { id: type.id, reason: 'Never sold' })
    const events = await t.rpc<Page<AuditEventView>>(kora.owner.cookie, 'audit/list', {
      entityType: 'room_type',
      entityId: type.id,
    })
    expect(events.data.items[0]).toMatchObject({
      action: 'room_type.archived',
      reason: 'Never sold',
      after: { archived: true, liveProperty: true },
    })
    await setLive(t, kora.abuja.id, null)
  })
})
