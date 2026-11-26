// Test fixtures for the rooms module: Kora Hotels Group with front desk switched on, two hotels, a
// GM limited to Victoria Island, front desk staff, and an unrelated group with a hotel of its own.
import type { Entity, Property, RoomTypeView } from '@vento/shared'
import { newId } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { properties } from '../db/schema/tenancy.ts'
import { switchFeature } from '../features/switches.ts'
import { ABUJA_ADDRESS } from '../test/addresses.ts'
import type { createTestApp } from '../test/harness.ts'

type TestApp = ReturnType<typeof createTestApp>
export type Person = { cookie: string; userId: string; email: string }
export type Page<T> = { items: T[]; page: number; pageSize: number; total: number }
// What an ORPCError looks like over HTTP.
export type Problem = {
  message: string
  code: string
  data?: { code?: string; numbers?: string[] }
}

async function hotel(t: TestApp, owner: Person, entityId: string, name: string) {
  return (
    await t.rpc<Property>(owner.cookie, 'properties/create', { entityId, name, ...ABUJA_ADDRESS })
  ).data
}

async function member(
  t: TestApp,
  owner: Person,
  orgId: string,
  name: string,
  role: string,
  hotelId: string,
) {
  const person = await t.signUp(name)
  await t.addMember(orgId, person, role)
  const current = await t.rpc<{ member: { id: string } }>(person.cookie, 'organization/current')
  await t.rpc(owner.cookie, 'members/setPropertyAccess', {
    memberId: current.data.member.id,
    allProperties: false,
    propertyIds: [hotelId],
  })
  return person
}

export async function koraWithRooms(t: TestApp) {
  const owner = await t.signUp('Adaeze Okafor')
  const orgId = await t.createOrganization(owner.cookie, 'Kora Hotels Group')
  await switchFeature(t.db, orgId, { feature: 'front_desk', to: 'on', reason: 'Rooms tests' })
  const entity = (await t.rpc<Entity>(owner.cookie, 'entities/create', { name: 'Kora Ltd' })).data
  const vi = await hotel(t, owner, entity.id, 'Kora Victoria Island')
  const abuja = await hotel(t, owner, entity.id, 'Kora Abuja')
  const gm = await member(t, owner, orgId, 'Tunde Bello', 'general_manager', vi.id)
  const frontDesk = await member(t, owner, orgId, 'Chiamaka Eze', 'front_desk', vi.id)

  const outsider = await t.signUp('Other Owner')
  const otherOrgId = await t.createOrganization(outsider.cookie, 'Another Group')
  await switchFeature(t.db, otherOrgId, { feature: 'front_desk', to: 'on', reason: 'Rooms tests' })
  const otherEntity = (
    await t.rpc<Entity>(outsider.cookie, 'entities/create', { name: 'Other Ltd' })
  ).data
  const otherHotel = await hotel(t, outsider, otherEntity.id, 'Other Hotel')
  return { owner, orgId, vi, abuja, gm, frontDesk, outsider, otherHotel }
}

let codeCounter = 0
// A room type with a unique name and code unless given.
export async function createType(
  t: TestApp,
  cookie: string,
  propertyId: string,
  overrides: Record<string, unknown> = {},
): Promise<RoomTypeView> {
  codeCounter++
  const response = await t.rpc<RoomTypeView>(cookie, 'roomTypes/create', {
    propertyId,
    name: `Type ${codeCounter} ${newId().slice(-4)}`,
    code: `T${String(codeCounter).padStart(3, '0')}`,
    bed: 'king',
    ...overrides,
  })
  if (response.status !== 200) throw new Error(`room type create failed: ${response.data.message}`)
  return response.data
}

export async function setLive(t: TestApp, propertyId: string, liveSince: string | null) {
  await t.db.update(properties).set({ liveSince }).where(eq(properties.id, propertyId))
}

export const floorRooms = (roomTypeId: string, floor: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    number: `${floor}${String(from + i).padStart(2, '0')}`,
    floor,
    roomTypeId,
  }))
