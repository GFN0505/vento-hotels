// Test fixtures for hotels and companies: Kora Hotels Group as onboarding leaves it (one company,
// Kora Victoria Island with no street), Kora Abuja with a full address, a GM limited to Victoria
// Island, a hotel-limited admin (a revenue manager the owner let manage setup) limited to Abuja,
// and an unrelated group with a hotel and company of its own.
import type { AuditEventView, Entity, Property } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { properties } from '../db/schema/tenancy.ts'
import { ABUJA_ADDRESS } from '../test/addresses.ts'
import type { createTestApp } from '../test/harness.ts'

type TestApp = ReturnType<typeof createTestApp>
export type Person = { cookie: string; userId: string; email: string; memberId: string }
export type Page<T> = { items: T[]; page: number; pageSize: number; total: number }
export type Problem = { message: string; code: string; data?: Record<string, unknown> }

async function person(t: TestApp, orgId: string, name: string, role: string): Promise<Person> {
  const signedUp = await t.signUp(name)
  await t.addMember(orgId, signedUp, role)
  const current = await t.rpc<{ member: { id: string } }>(signedUp.cookie, 'organization/current')
  return { ...signedUp, memberId: current.data.member.id }
}

export async function limitTo(t: TestApp, owner: Person, member: Person, hotelIds: string[]) {
  const result = await t.rpc(owner.cookie, 'members/setPropertyAccess', {
    memberId: member.memberId,
    allProperties: false,
    propertyIds: hotelIds,
  })
  if (result.status !== 200) throw new Error(`access change failed: ${result.data.message}`)
}

export async function koraGroup(t: TestApp) {
  const signedUp = await t.signUp('Adaeze Okafor')
  const orgId = await t.createOrganization(signedUp.cookie, 'Kora Hotels Group')
  const me = await t.rpc<{ member: { id: string } }>(signedUp.cookie, 'organization/current')
  const owner: Person = { ...signedUp, memberId: me.data.member.id }
  const company = (
    await t.rpc<Entity>(owner.cookie, 'entities/create', { name: 'Kora Hospitality Ltd' })
  ).data
  // As onboarding creates it: a name and a state, nothing else.
  const vi = (
    await t.rpc<Property>(owner.cookie, 'properties/create', {
      entityId: company.id,
      name: 'Kora Victoria Island',
      state: 'Lagos',
    })
  ).data
  const abuja = (
    await t.rpc<Property>(owner.cookie, 'properties/create', {
      entityId: company.id,
      name: 'Kora Abuja',
      ...ABUJA_ADDRESS,
    })
  ).data
  const gm = await person(t, orgId, 'Tunde Bello', 'general_manager')
  await limitTo(t, owner, gm, [vi.id])
  await t.rpc(owner.cookie, 'permissions/set', {
    role: 'revenue_manager',
    permission: 'setup.manage',
    allowed: true,
    reason: 'Abuja runs its own setup',
  })
  const hotelAdmin = await person(t, orgId, 'Ngozi Obi', 'revenue_manager')
  await limitTo(t, owner, hotelAdmin, [abuja.id])

  const outsiderSignedUp = await t.signUp('Other Owner')
  const otherOrgId = await t.createOrganization(outsiderSignedUp.cookie, 'Another Group')
  const outsiderMe = await t.rpc<{ member: { id: string } }>(
    outsiderSignedUp.cookie,
    'organization/current',
  )
  const outsider: Person = { ...outsiderSignedUp, memberId: outsiderMe.data.member.id }
  const otherCompany = (
    await t.rpc<Entity>(outsider.cookie, 'entities/create', { name: 'Other Ltd' })
  ).data
  const otherHotel = (
    await t.rpc<Property>(outsider.cookie, 'properties/create', {
      entityId: otherCompany.id,
      name: 'Other Hotel',
    })
  ).data
  return {
    orgId,
    owner,
    company,
    vi,
    abuja,
    gm,
    hotelAdmin,
    outsider,
    otherOrgId,
    otherCompany,
    otherHotel,
  }
}

export type Kora = Awaited<ReturnType<typeof koraGroup>>

// Go-live is set by night audit (brick 13); tests set it directly.
export async function setLive(t: TestApp, propertyId: string, liveSince: string | null) {
  await t.db.update(properties).set({ liveSince }).where(eq(properties.id, propertyId))
}

// The newest audit event for a record, as the owner sees it in the audit log.
export async function lastEvent(
  t: TestApp,
  owner: Person,
  entityType: string,
  entityId: string,
): Promise<AuditEventView | undefined> {
  const page = await t.rpc<Page<AuditEventView>>(owner.cookie, 'audit/list', {
    entityType,
    entityId,
    pageSize: 1,
  })
  return page.data.items[0]
}

export async function events(
  t: TestApp,
  owner: Person,
  entityType: string,
  entityId: string,
): Promise<AuditEventView[]> {
  const page = await t.rpc<Page<AuditEventView>>(owner.cookie, 'audit/list', {
    entityType,
    entityId,
    pageSize: 50,
  })
  return page.data.items
}

// The hotel as the owner sees it now (for its current version).
export async function hotel(t: TestApp, owner: Person, id: string): Promise<Property> {
  return (await t.rpc<Property>(owner.cookie, 'properties/get', { id })).data
}
