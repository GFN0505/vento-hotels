// Sign-in, organization isolation and property scoping, against the real test database through the
// real HTTP endpoints (spec: docs/specs/stage-0-auth-and-tenancy.md).
import type { Entity, Property } from '@vento/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ABUJA_ADDRESS } from '../test/addresses.ts'
import { createTestApp, PASSWORD } from '../test/harness.ts'

const url = process.env.TEST_DATABASE_URL

type Page<T> = { items: T[]; total: number }

describe.skipIf(!url)('sign-in, organizations and properties', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())

  // Kora Hotels Group (the demo world) and an unrelated group.
  let owner: { cookie: string; userId: string }
  let outsider: { cookie: string; userId: string }
  let koraId: string
  let victoriaIsland: Property
  let abuja: Property
  let otherGroupProperty: Property

  beforeAll(async () => {
    owner = await t.signUp('Adaeze Okafor')
    koraId = await t.createOrganization(owner.cookie, 'Kora Hotels Group')
    const entity = await t.rpc<Entity>(owner.cookie, 'entities/create', {
      name: 'Kora Hospitality Ltd',
    })
    victoriaIsland = (
      await t.rpc<Property>(owner.cookie, 'properties/create', {
        entityId: entity.data.id,
        name: 'Kora Victoria Island',
        area: 'Victoria Island',
        lga: 'Eti-Osa',
        state: 'Lagos',
      })
    ).data
    abuja = (
      await t.rpc<Property>(owner.cookie, 'properties/create', {
        entityId: entity.data.id,
        name: 'Kora Abuja',
        ...ABUJA_ADDRESS,
      })
    ).data

    outsider = await t.signUp('Other Owner')
    await t.createOrganization(outsider.cookie, 'Another Hotel Group')
    const otherEntity = await t.rpc<Entity>(outsider.cookie, 'entities/create', {
      name: 'Other Ltd',
    })
    otherGroupProperty = (
      await t.rpc<Property>(outsider.cookie, 'properties/create', {
        entityId: otherEntity.data.id,
        name: 'Other Hotel',
      })
    ).data
  })

  describe('sign-in', () => {
    it('refuses unverified emails', async () => {
      const email = `unverified.${Date.now()}@example.test`
      await t.call('/api/auth/sign-up/email', {
        body: { name: 'Not Verified', email, password: PASSWORD },
      })
      const signIn = await t.call('/api/auth/sign-in/email', {
        body: { email, password: PASSWORD },
      })
      expect(signIn.status).toBe(403)
    })

    it('refuses weak passwords at the API, whatever the screen allowed', async () => {
      for (const password of [
        'short1!A',
        'alllowercase1!',
        'ALLUPPERCASE1!',
        'NoNumbers!!',
        'NoSpecial123',
      ]) {
        const weak = password === 'short1!A' ? 'Sh1!' : password
        const response = await t.call('/api/auth/sign-up/email', {
          body: {
            name: 'Weak Password',
            email: `weak.${Date.now()}.${weak.length}@example.test`,
            password: weak,
          },
        })
        expect(response.status, weak).toBe(400)
        expect(((await response.json()) as { code: string }).code).toBe('PASSWORD_TOO_WEAK')
      }
    })

    it('answers 401 without a session', async () => {
      expect((await t.rpc(undefined, 'properties/list', {})).status).toBe(401)
    })

    it('answers 403 when no organization is chosen', async () => {
      const newcomer = await t.signUp('Newcomer')
      const result = await t.rpc(newcomer.cookie, 'properties/list', {})
      expect(result.status).toBe(403)
      expect(result.data.message).toBe('Choose an organization first')
    })
  })

  describe('the owner', () => {
    it('is the owner of the group they created, with all properties', async () => {
      const result = await t.rpc<{
        organization: { id: string }
        member: { role: string; allProperties: boolean }
      }>(owner.cookie, 'organization/current')
      expect(result.data.organization.id).toBe(koraId)
      expect(result.data.member).toMatchObject({ role: 'owner', allProperties: true })
    })

    it('starts each property on today in its own time zone, with Lagos defaults', () => {
      expect(victoriaIsland).toMatchObject({
        timeZone: 'Africa/Lagos',
        checkInTime: '14:00',
        checkOutTime: '12:00',
        country: 'NG',
      })
      expect(victoriaIsland.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('lists the group properties in the shared page shape', async () => {
      const result = await t.rpc<Page<Property>>(owner.cookie, 'properties/list', { pageSize: 10 })
      expect(result.data.total).toBe(2)
      expect(result.data.items.map((p) => p.name)).toEqual(['Kora Abuja', 'Kora Victoria Island'])
    })

    it('refuses a duplicate property name', async () => {
      const result = await t.rpc(owner.cookie, 'properties/create', {
        entityId: victoriaIsland.entityId,
        name: 'Kora Victoria Island',
      })
      expect(result.status).toBe(409)
    })
  })

  describe('organization isolation', () => {
    it("never lists another group's properties", async () => {
      const result = await t.rpc<Page<Property>>(outsider.cookie, 'properties/list', {})
      expect(result.data.items.map((p) => p.id)).toEqual([otherGroupProperty.id])
    })

    it("answers 404 for another group's property, even with its exact id", async () => {
      expect(
        (await t.rpc(outsider.cookie, 'properties/get', { id: victoriaIsland.id })).status,
      ).toBe(404)
      expect(
        (await t.rpc(owner.cookie, 'properties/get', { id: otherGroupProperty.id })).status,
      ).toBe(404)
    })

    it("refuses to create a property under another group's company", async () => {
      const result = await t.rpc(outsider.cookie, 'properties/create', {
        entityId: victoriaIsland.entityId,
        name: 'Sneaky Hotel',
      })
      expect(result.status).toBe(400)
    })

    it('ignores an organizationId smuggled into the input', async () => {
      const result = await t.rpc<Entity>(outsider.cookie, 'entities/create', {
        name: 'Smuggled Ltd',
        organizationId: koraId,
      })
      const koraEntities = await t.rpc<Page<Entity>>(owner.cookie, 'entities/list', {})
      expect(koraEntities.data.items.map((e) => e.name)).not.toContain('Smuggled Ltd')
      expect(result.status).toBe(200)
    })
  })

  describe('property scoping', () => {
    let frontDesk: { cookie: string; userId: string }
    let frontDeskMemberId: string

    beforeAll(async () => {
      frontDesk = await t.signUp('Chiamaka Eze')
      await t.addMember(koraId, frontDesk, 'front_desk')
      const current = await t.rpc<{ member: { id: string } }>(
        frontDesk.cookie,
        'organization/current',
      )
      frontDeskMemberId = current.data.member.id
    })

    it('gives a new member no properties until access is granted (closed by default)', async () => {
      const result = await t.rpc<Page<Property>>(frontDesk.cookie, 'properties/list', {})
      expect(result.data.total).toBe(0)
    })

    it('shows a member limited to Victoria Island only that property', async () => {
      await t.rpc(owner.cookie, 'members/setPropertyAccess', {
        memberId: frontDeskMemberId,
        allProperties: false,
        propertyIds: [victoriaIsland.id],
      })
      const list = await t.rpc<Page<Property>>(frontDesk.cookie, 'properties/list', {})
      expect(list.data.items.map((p) => p.name)).toEqual(['Kora Victoria Island'])
      expect((await t.rpc(frontDesk.cookie, 'properties/get', { id: abuja.id })).status).toBe(404)
      expect(
        (await t.rpc(frontDesk.cookie, 'properties/get', { id: victoriaIsland.id })).status,
      ).toBe(200)
    })

    it('shows every property once given all properties', async () => {
      await t.rpc(owner.cookie, 'members/setPropertyAccess', {
        memberId: frontDeskMemberId,
        allProperties: true,
      })
      const list = await t.rpc<Page<Property>>(frontDesk.cookie, 'properties/list', {})
      expect(list.data.total).toBe(2)
    })

    it('does not let front desk change the setup', async () => {
      expect(
        (await t.rpc(frontDesk.cookie, 'entities/create', { name: 'Front Desk Ltd' })).status,
      ).toBe(403)
      expect(
        (
          await t.rpc(frontDesk.cookie, 'members/setPropertyAccess', {
            memberId: frontDeskMemberId,
            allProperties: true,
          })
        ).status,
      ).toBe(403)
    })

    it("refuses to grant another group's property", async () => {
      const result = await t.rpc(owner.cookie, 'members/setPropertyAccess', {
        memberId: frontDeskMemberId,
        allProperties: false,
        propertyIds: [otherGroupProperty.id],
      })
      expect(result.status).toBe(400)
    })
  })
})
