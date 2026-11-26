// Test fixtures for taxes, payments and FX: Kora Hotels Group with front desk on; Kora Hospitality
// Ltd (VAT registered) owning Kora Victoria Island and Kora Ikeja GRA in Lagos; Kora PH Ltd (not
// VAT registered) owning Kora Port Harcourt in Rivers; finance with the whole group; a finance
// member limited to Victoria Island; a GM and front desk at Victoria Island; and another group.
import type { AuditEventView, Entity, Property, TaxSetup, TaxView } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { properties } from '../db/schema/tenancy.ts'
import { switchFeature } from '../features/switches.ts'
import { limitTo, type Person, person } from '../tenancy/testing.ts'
import { LAGOS_ADDRESS } from '../test/addresses.ts'
import type { createTestApp } from '../test/harness.ts'

type TestApp = ReturnType<typeof createTestApp>
export type Page<T> = { items: T[]; page: number; pageSize: number; total: number }
export type Problem = { message: string; code: string; data?: Record<string, unknown> }

const RIVERS = {
  addressLine1: '15 Tombia Street',
  area: 'GRA Phase 2',
  state: 'Rivers',
  lga: 'Obio-Akpor',
} as const

async function company(t: TestApp, owner: Person, name: string, vatRegistered: boolean) {
  return (await t.rpc<Entity>(owner.cookie, 'entities/create', { name, vatRegistered })).data
}

async function hotel(t: TestApp, owner: Person, entityId: string, name: string, address: object) {
  const created = await t.rpc<Property>(owner.cookie, 'properties/create', {
    entityId,
    name,
    ...address,
  })
  if (created.status !== 200) throw new Error(`hotel create failed: ${created.data.message}`)
  return created.data
}

export async function koraFinance(t: TestApp) {
  const signedUp = await t.signUp('Adaeze Okafor')
  const orgId = await t.createOrganization(signedUp.cookie, 'Kora Hotels Group')
  const me = await t.rpc<{ member: { id: string } }>(signedUp.cookie, 'organization/current')
  const owner: Person = { ...signedUp, memberId: me.data.member.id }
  await switchFeature(t.db, orgId, { feature: 'front_desk', to: 'on', reason: 'Finance tests' })
  const hospitality = await company(t, owner, 'Kora Hospitality Ltd', true)
  const phLtd = await company(t, owner, 'Kora PH Ltd', false)
  const vi = await hotel(t, owner, hospitality.id, 'Kora Victoria Island', LAGOS_ADDRESS)
  const ikeja = await hotel(t, owner, hospitality.id, 'Kora Ikeja GRA', {
    ...LAGOS_ADDRESS,
    area: 'Ikeja GRA',
    lga: 'Ikeja',
  })
  const ph = await hotel(t, owner, phLtd.id, 'Kora Port Harcourt', RIVERS)
  const finance = await person(t, orgId, 'Kunle Ade', 'finance')
  await t.rpc(owner.cookie, 'members/setPropertyAccess', {
    memberId: finance.memberId,
    allProperties: true,
  })
  const viFinance = await person(t, orgId, 'Folake Nwosu', 'finance')
  await limitTo(t, owner, viFinance, [vi.id])
  const gm = await person(t, orgId, 'Tunde Bello', 'general_manager')
  await limitTo(t, owner, gm, [vi.id])
  const frontDesk = await person(t, orgId, 'Chiamaka Eze', 'front_desk')
  await limitTo(t, owner, frontDesk, [vi.id])

  const outsider = await t.signUp('Other Owner')
  const otherOrgId = await t.createOrganization(outsider.cookie, 'Another Group')
  await switchFeature(t.db, otherOrgId, {
    feature: 'front_desk',
    to: 'on',
    reason: 'Finance tests',
  })
  const outsiderMe = await t.rpc<{ member: { id: string } }>(
    outsider.cookie,
    'organization/current',
  )
  const other: Person = { ...outsider, memberId: outsiderMe.data.member.id }
  const otherCompany = await company(t, other, 'Other Ltd', true)
  const otherHotel = await hotel(t, other, otherCompany.id, 'Other Hotel', LAGOS_ADDRESS)
  return {
    orgId,
    owner,
    hospitality,
    phLtd,
    vi,
    ikeja,
    ph,
    finance,
    viFinance,
    gm,
    frontDesk,
    other,
    otherHotel,
  }
}

export type KoraFinance = Awaited<ReturnType<typeof koraFinance>>

// Night audit sets these (brick 13); tests set them directly.
export async function setHotel(
  t: TestApp,
  id: string,
  values: { businessDate?: string; liveSince?: string | null },
) {
  await t.db.update(properties).set(values).where(eq(properties.id, id))
}

export const taxNamed = (setup: TaxSetup, name: string): TaxView => {
  const found = setup.taxes.find((tax) => tax.name === name)
  if (!found) throw new Error(`no tax called ${name}`)
  return found
}

export async function events(t: TestApp, owner: Person, filter: Record<string, unknown>) {
  const page = await t.rpc<Page<AuditEventView>>(owner.cookie, 'audit/list', {
    ...filter,
    pageSize: 50,
  })
  return page.data.items
}
