// The hotel switch scopes every list (spec: stage-1-hotel-switch-scope.md): members, invites,
// devices and companies narrow to one hotel, Home's counts per hotel match them, and a hotel
// outside the caller's access, in another group or archived answers "not found".
import type {
  DeviceView,
  Entity,
  HomeSummary,
  InvitationView,
  MemberView,
  Property,
} from '@vento/shared'
import { newId } from '@vento/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LAGOS_ADDRESS } from '../test/addresses.ts'
import { createTestApp } from '../test/harness.ts'
import { type Kora, koraGroup, limitTo, type Page, type Person, person } from './testing.ts'

const url = process.env.TEST_DATABASE_URL

type Problem = { message: string; data?: { code?: string } }
const LISTS = ['members/list', 'invitations/list', 'devices/list', 'entities/list'] as const

describe.skipIf(!url)('the hotel switch scopes every list', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())

  let kora: Kora
  let ikeja: Property
  let lekki: Property
  let otherCompany: Entity
  let sade: Person

  const names = async <T extends { name: string }>(cookie: string, path: string, input: object) =>
    (await t.rpc<Page<T>>(cookie, path, { pageSize: 100, ...input })).data.items.map((i) => i.name)
  const people = (cookie: string, input: object) => names<MemberView>(cookie, 'members/list', input)
  const invites = async (propertyId?: string) =>
    (
      await t.rpc<Page<InvitationView>>(kora.owner.cookie, 'invitations/list', { propertyId })
    ).data.items
      .map((i) => i.email.split('.')[0])
      .sort()
  const register = (name: string, propertyId: string) =>
    t.rpc<DeviceView>(kora.owner.cookie, 'devices/register', {
      name,
      kind: 'front_desk',
      propertyId,
    })
  const invite = (who: string, role: string, access: object) =>
    t.rpc(kora.owner.cookie, 'invitations/create', {
      emails: [`${who}.${newId().slice(-8)}@example.test`],
      role,
      access,
    })

  beforeAll(async () => {
    kora = await koraGroup(t)
    otherCompany = (
      await t.rpc<Entity>(kora.owner.cookie, 'entities/create', { name: 'Kora Mainland Ltd' })
    ).data
    ikeja = (
      await t.rpc<Property>(kora.owner.cookie, 'properties/create', {
        entityId: otherCompany.id,
        name: 'Kora Ikeja GRA',
        ...LAGOS_ADDRESS,
      })
    ).data
    lekki = (
      await t.rpc<Property>(kora.owner.cookie, 'properties/create', {
        entityId: kora.company.id,
        name: 'Kora Lekki',
        ...LAGOS_ADDRESS,
      })
    ).data
    // A group admin whose row doesn't say "all hotels": the role alone gives the whole group.
    await person(t, kora.orgId, 'Bola Ahmed', 'group_admin')
    const finance = await person(t, kora.orgId, 'Kunle Ade', 'finance')
    await t.rpc(kora.owner.cookie, 'members/setPropertyAccess', {
      memberId: finance.memberId,
      allProperties: true,
    })
    // 2 of the group's hotels; revenue managers may manage setup in this group (koraGroup).
    sade = await person(t, kora.orgId, 'Sade Bakare', 'revenue_manager')
    await limitTo(t, kora.owner, sade, [kora.vi.id, ikeja.id])

    await invite('abuja', 'front_desk', { allProperties: false, propertyIds: [kora.abuja.id] })
    await invite('vi', 'front_desk', { allProperties: false, propertyIds: [kora.vi.id] })
    await invite('whole', 'finance', { allProperties: true })

    await register('FD-VI-01', kora.vi.id)
    const pos = await register('POS-VI-03', kora.vi.id)
    await t.rpc(kora.owner.cookie, 'devices/revoke', { id: pos.data.id, reason: 'Screen broken' })
    await register('FD-IKJ-01', ikeja.id)
    await register('FD-LKK-01', lekki.id)
    const archived = await t.rpc(kora.owner.cookie, 'properties/archive', {
      id: lekki.id,
      reason: 'Lease ended 30 Nov 2026',
    })
    expect(archived.status).toBe(200)
  })

  describe('members', () => {
    it('lists the people who work at one hotel, whole-group people included', async () => {
      const owner = kora.owner.cookie
      expect(await people(owner, { propertyId: kora.vi.id })).toEqual([
        'Adaeze Okafor',
        'Bola Ahmed',
        'Kunle Ade',
        'Sade Bakare',
        'Tunde Bello',
      ])
      expect(await people(owner, { propertyId: ikeja.id })).toEqual([
        'Adaeze Okafor',
        'Bola Ahmed',
        'Kunle Ade',
        'Sade Bakare',
      ])
      expect(await people(owner, { propertyId: kora.abuja.id })).toEqual([
        'Adaeze Okafor',
        'Bola Ahmed',
        'Kunle Ade',
        'Ngozi Obi',
      ])
      expect(await people(owner, {})).toHaveLength(6)
    })

    it('marks the whole-group people at a hotel as seeing the whole group', async () => {
      const page = await t.rpc<Page<MemberView>>(kora.owner.cookie, 'members/list', {
        propertyId: kora.abuja.id,
      })
      expect(page.data.items.map((m) => [m.name, m.allProperties])).toEqual([
        ['Adaeze Okafor', true],
        ['Bola Ahmed', true],
        ['Kunle Ade', true],
        ['Ngozi Obi', false],
      ])
    })

    it('combines the hotel with search and role filters', async () => {
      const owner = kora.owner.cookie
      expect(await people(owner, { propertyId: ikeja.id, search: 'sade' })).toEqual(['Sade Bakare'])
      expect(await people(owner, { propertyId: ikeja.id, filter: 'admins' })).toEqual([
        'Adaeze Okafor',
        'Bola Ahmed',
      ])
      expect(await people(owner, { propertyId: ikeja.id, filter: 'managers' })).toEqual([
        'Kunle Ade',
        'Sade Bakare',
      ])
      expect(await people(owner, { propertyId: kora.abuja.id, search: 'tunde' })).toEqual([])
    })

    it('narrows within what a hotel-limited manager already sees, never wider', async () => {
      expect(await people(sade.cookie, {})).toEqual(['Sade Bakare', 'Tunde Bello'])
      expect(await people(sade.cookie, { propertyId: kora.vi.id })).toEqual([
        'Sade Bakare',
        'Tunde Bello',
      ])
      expect(await people(sade.cookie, { propertyId: ikeja.id })).toEqual(['Sade Bakare'])
    })
  })

  describe('invitations', () => {
    it("lists a hotel's invites with the whole-group ones", async () => {
      expect(await invites(kora.abuja.id)).toEqual(['abuja', 'whole'])
      expect(await invites(kora.vi.id)).toEqual(['vi', 'whole'])
      expect(await invites(ikeja.id)).toEqual(['whole'])
      expect(await invites()).toEqual(['abuja', 'vi', 'whole'])
    })

    it('shows hotel-limited managers no invites, as before', async () => {
      const page = await t.rpc<Page<InvitationView>>(sade.cookie, 'invitations/list', {
        propertyId: kora.vi.id,
      })
      expect(page.data).toMatchObject({ items: [], total: 0 })
    })
  })

  describe('devices', () => {
    it("lists one hotel's devices, live first", async () => {
      expect(
        await names<DeviceView>(kora.owner.cookie, 'devices/list', { propertyId: kora.vi.id }),
      ).toEqual(['FD-VI-01', 'POS-VI-03'])
      expect(
        await names<DeviceView>(kora.owner.cookie, 'devices/list', { propertyId: kora.abuja.id }),
      ).toEqual([])
    })

    it('lists every device at an active hotel, live first, then by hotel and name', async () => {
      const page = await t.rpc<Page<DeviceView>>(kora.owner.cookie, 'devices/list', {})
      expect(page.data.items.map((d) => [d.name, d.propertyName])).toEqual([
        ['FD-IKJ-01', 'Kora Ikeja GRA'],
        ['FD-VI-01', 'Kora Victoria Island'],
        ['POS-VI-03', 'Kora Victoria Island'],
      ])
      expect(page.data.total).toBe(3)
    })

    it("lists only the hotel-limited manager's hotels", async () => {
      expect(await names<DeviceView>(sade.cookie, 'devices/list', {})).toEqual([
        'FD-IKJ-01',
        'FD-VI-01',
        'POS-VI-03',
      ])
      expect(
        await names<DeviceView>(sade.cookie, 'devices/list', { propertyId: ikeja.id }),
      ).toEqual(['FD-IKJ-01'])
    })
  })

  describe('companies', () => {
    it('shows a hotel-limited manager only the company that owns the chosen hotel', async () => {
      expect(await names<Entity>(sade.cookie, 'entities/list', { propertyId: ikeja.id })).toEqual([
        'Kora Mainland Ltd',
      ])
      expect(await names<Entity>(sade.cookie, 'entities/list', { propertyId: kora.vi.id })).toEqual(
        ['Kora Hospitality Ltd'],
      )
    })
  })

  describe("Home's counts", () => {
    it('match the people, live devices and invites listed for every hotel', async () => {
      const home = await t.rpc<HomeSummary>(kora.owner.cookie, 'organization/home', {})
      expect(home.data.byHotel).toHaveLength(3)
      for (const hotel of home.data.byHotel) {
        const scoped = { propertyId: hotel.propertyId, pageSize: 100 }
        const [members, devices, invited] = await Promise.all([
          t.rpc<Page<MemberView>>(kora.owner.cookie, 'members/list', scoped),
          t.rpc<Page<DeviceView>>(kora.owner.cookie, 'devices/list', scoped),
          t.rpc<Page<InvitationView>>(kora.owner.cookie, 'invitations/list', scoped),
        ])
        expect({
          people: members.data.total,
          devices: devices.data.items.filter((d) => d.revokedAt === null).length,
          invites: invited.data.total,
        }).toEqual({ people: hotel.people, devices: hotel.devices, invites: hotel.invites })
      }
    })

    it('gives no invite counts to people who do not manage the team', async () => {
      const gm = await t.rpc<HomeSummary>(kora.gm.cookie, 'organization/home', {})
      expect(gm.data.byHotel).toEqual([
        expect.objectContaining({ propertyId: kora.vi.id, people: 5, invites: null }),
      ])
    })
  })

  describe('hotels the caller may not list', () => {
    it.each(LISTS)("%s answers not found for another group's hotel", async (path) => {
      const result = await t.rpc<Problem>(kora.owner.cookie, path, {
        propertyId: kora.otherHotel.id,
      })
      expect([result.status, result.data.message]).toEqual([404, "We couldn't find that hotel"])
    })

    it.each(LISTS)('%s answers not found for an unknown hotel', async (path) => {
      const result = await t.rpc<Problem>(kora.owner.cookie, path, { propertyId: newId() })
      expect([result.status, result.data.message]).toEqual([404, "We couldn't find that hotel"])
    })

    it.each(LISTS)('%s answers not found for a hotel outside a member’s 2 of 4', async (path) => {
      const result = await t.rpc<Problem>(sade.cookie, path, { propertyId: kora.abuja.id })
      expect([result.status, result.data.message]).toEqual([404, "We couldn't find that hotel"])
    })

    it.each(LISTS)('%s says an archived hotel was archived', async (path) => {
      const result = await t.rpc<Problem>(kora.owner.cookie, path, { propertyId: lekki.id })
      expect([result.status, result.data.message, result.data.data?.code]).toEqual([
        404,
        'This hotel was archived.',
        'PROPERTY_ARCHIVED',
      ])
    })

    it('never tells someone outside an archived hotel that it was archived', async () => {
      const result = await t.rpc<Problem>(sade.cookie, 'members/list', { propertyId: lekki.id })
      expect(result.data.message).toBe("We couldn't find that hotel")
    })
  })
})
