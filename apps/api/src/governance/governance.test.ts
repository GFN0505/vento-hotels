// Permissions, limits and the audit log, on the real test database through the real HTTP flow
// (spec: docs/specs/stage-0-permissions-and-audit.md).
import type { AuditEventView, Entity, PermissionRuleView, Property } from '@vento/shared'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApprovalRequiredError, loadAccess, requireWithinLimit } from '../tenancy/access.ts'
import { createTestApp } from '../test/harness.ts'

const url = process.env.TEST_DATABASE_URL

type Page<T> = { items: T[]; total: number }
type Person = { cookie: string; userId: string }

describe.skipIf(!url)('permissions, limits and audit', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())

  let owner: Person
  let frontDesk: Person
  let generalManager: Person
  let groupAdmin: Person
  let otherOwner: Person
  let koraId: string
  let otherId: string
  let victoriaIsland: Property
  let abuja: Property

  const memberIdOf = async (person: Person) =>
    (await t.rpc<{ member: { id: string } }>(person.cookie, 'organization/current')).data.member.id

  beforeAll(async () => {
    owner = await t.signUp('Adaeze Okafor')
    koraId = await t.createOrganization(owner.cookie, 'Kora Hotels Group')
    const entity = (
      await t.rpc<Entity>(owner.cookie, 'entities/create', { name: 'Kora Hospitality Ltd' })
    ).data
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
      })
    ).data

    frontDesk = await t.signUp('Chiamaka Eze')
    await t.addMember(koraId, frontDesk, 'front_desk')
    generalManager = await t.signUp('Tunde Bello')
    await t.addMember(koraId, generalManager, 'general_manager')
    groupAdmin = await t.signUp('Group Admin')
    await t.addMember(koraId, groupAdmin, 'group_admin')

    // The GM runs Kora Victoria Island only.
    await t.rpc(owner.cookie, 'members/setPropertyAccess', {
      memberId: await memberIdOf(generalManager),
      allProperties: false,
      propertyIds: [victoriaIsland.id],
    })

    otherOwner = await t.signUp('Other Owner')
    otherId = await t.createOrganization(otherOwner.cookie, 'Another Hotel Group')
    await t.rpc(otherOwner.cookie, 'entities/create', { name: 'Other Ltd' })
  })

  describe('audit events', () => {
    it('records each setup change with who did it and what changed', async () => {
      const page = await t.rpc<Page<AuditEventView>>(owner.cookie, 'audit/list', { pageSize: 50 })
      const actions = page.data.items.map((e) => e.action)
      expect(actions).toEqual(
        expect.arrayContaining([
          'entity.created',
          'property.created',
          'member.property_access_changed',
        ]),
      )
      const created = page.data.items.find(
        (e) => e.action === 'property.created' && e.entityId === abuja.id,
      )
      expect(created).toMatchObject({ actorName: 'Adaeze Okafor', propertyId: abuja.id })
      expect(created?.after).toMatchObject({ name: 'Kora Abuja' })
    })

    it('records property access before and after', async () => {
      const page = await t.rpc<Page<AuditEventView>>(owner.cookie, 'audit/list', {
        entityType: 'member',
        entityId: await memberIdOf(generalManager),
      })
      const change = page.data.items.find((e) => e.action === 'member.property_access_changed')
      expect(change?.before).toMatchObject({ allProperties: false, propertyIds: [] })
      expect(change?.after).toMatchObject({
        allProperties: false,
        propertyIds: [victoriaIsland.id],
      })
    })

    it('records members added through sign-in, without an actor', async () => {
      const page = await t.rpc<Page<AuditEventView>>(owner.cookie, 'audit/list', { pageSize: 50 })
      const added = page.data.items.filter((e) => e.action === 'member.added')
      // Includes the owner, added when the organization was created.
      expect(added.map((e) => (e.after as { role: string }).role).sort()).toEqual(
        ['front_desk', 'general_manager', 'group_admin', 'owner'].sort(),
      )
      for (const event of added) {
        expect(event).toMatchObject({ actorMemberId: null, actorName: 'Sign-in service' })
      }
    })

    it('refuses to edit or delete history, even with direct SQL', async () => {
      await expect(
        t.db.execute(sql`update audit_events set reason = 'tampered'`),
      ).rejects.toMatchObject({
        cause: { code: '23001' },
      })
      await expect(t.db.execute(sql`delete from audit_events`)).rejects.toMatchObject({
        cause: { code: '23001' },
      })
    })

    it('rolls the audit event back with a failed change', async () => {
      const before = (await t.rpc<Page<AuditEventView>>(owner.cookie, 'audit/list', {})).data.total
      const duplicate = await t.rpc(owner.cookie, 'properties/create', {
        entityId: victoriaIsland.entityId,
        name: 'Kora Abuja',
      })
      expect(duplicate.status).toBe(409)
      const after = (await t.rpc<Page<AuditEventView>>(owner.cookie, 'audit/list', {})).data.total
      expect(after).toBe(before)
    })
  })

  describe('who can read the audit log', () => {
    it('refuses front desk', async () => {
      expect((await t.rpc(frontDesk.cookie, 'audit/list', {})).status).toBe(403)
    })

    it('shows a GM limited to Victoria Island only that property’s events', async () => {
      const page = await t.rpc<Page<AuditEventView>>(generalManager.cookie, 'audit/list', {
        pageSize: 50,
      })
      expect(page.status).toBe(200)
      expect(page.data.items.length).toBeGreaterThan(0)
      expect(new Set(page.data.items.map((e) => e.propertyId))).toEqual(
        new Set([victoriaIsland.id]),
      )
    })

    it("never shows one group's events to another", async () => {
      const page = await t.rpc<Page<AuditEventView>>(otherOwner.cookie, 'audit/list', {
        pageSize: 50,
      })
      expect(page.data.items.map((e) => e.action).sort()).toEqual([
        'entity.created',
        'member.added',
      ])
      const koraIds = new Set([victoriaIsland.id, abuja.id, victoriaIsland.entityId])
      expect(
        page.data.items.some(
          (e) => koraIds.has(e.entityId ?? '') || koraIds.has(e.propertyId ?? ''),
        ),
      ).toBe(false)
      expect(page.data.items.map((e) => e.actorName).sort()).toEqual([
        'Other Owner',
        'Sign-in service',
      ])
    })
  })

  describe('permissions matrix', () => {
    it('shows the owner the full matrix with defaults', async () => {
      const result = await t.rpc<{ items: PermissionRuleView[] }>(owner.cookie, 'permissions/list')
      const rule = result.data.items.find(
        (r) => r.role === 'front_desk' && r.permission === 'stay.rate_override',
      )
      expect(rule).toMatchObject({
        allowed: true,
        limit: '10',
        limitKind: 'percent',
        isDefault: true,
      })
    })

    it('keeps permission changes with the owner alone; people who manage the team can look', async () => {
      expect((await t.rpc(groupAdmin.cookie, 'permissions/list')).status).toBe(200)
      const change = await t.rpc(groupAdmin.cookie, 'permissions/set', {
        role: 'front_desk',
        permission: 'room.move',
        allowed: false,
        limit: null,
        reason: 'trying to change it',
      })
      expect(change.status).toBe(403)
      expect((await t.rpc(generalManager.cookie, 'permissions/list')).status).toBe(403)
    })

    it('refuses changes to the owner role, limits on permissions without one, and missing reasons', async () => {
      const base = { allowed: true, limit: null, reason: 'testing' }
      expect(
        (
          await t.rpc(owner.cookie, 'permissions/set', {
            ...base,
            role: 'owner',
            permission: 'refund',
          })
        ).status,
      ).toBe(400)
      expect(
        (
          await t.rpc(owner.cookie, 'permissions/set', {
            ...base,
            role: 'front_desk',
            permission: 'room.move',
            limit: '5',
          })
        ).status,
      ).toBe(400)
      expect(
        (
          await t.rpc(owner.cookie, 'permissions/set', {
            ...base,
            role: 'front_desk',
            permission: 'stay.rate_override',
            limit: '150',
          })
        ).status,
      ).toBe(400)
      expect(
        (
          await t.rpc(owner.cookie, 'permissions/set', {
            role: 'front_desk',
            permission: 'stay.rate_override',
            allowed: true,
            limit: '15',
          })
        ).status,
      ).toBe(400)
    })
  })

  describe('limits', () => {
    const accessFor = async (person: Person, organizationId: string) => {
      const access = await loadAccess(t.db, organizationId, { id: person.userId, name: 'x' })
      if (!access) throw new Error('no access')
      return access
    }

    it('allows front desk up to and including their 10% limit, and asks for approval above it', async () => {
      const access = await accessFor(frontDesk, koraId)
      expect(() => requireWithinLimit(access, 'stay.rate_override', '10')).not.toThrow()
      expect(() => requireWithinLimit(access, 'stay.rate_override', '10.01')).toThrow(
        ApprovalRequiredError,
      )
      try {
        requireWithinLimit(access, 'stay.rate_override', '15')
      } catch (error) {
        expect((error as ApprovalRequiredError).data).toEqual({
          code: 'APPROVAL_REQUIRED',
          permission: 'stay.rate_override',
          limit: '10',
          value: '15',
        })
      }
    })

    it('refuses a permission the role does not have, whatever the amount', async () => {
      const access = await accessFor(frontDesk, koraId)
      expect(() => requireWithinLimit(access, 'refund', '1')).toThrow(/don't have access/)
    })

    it("applies the owner's change for this group only, and audits it with the reason", async () => {
      const changed = await t.rpc<PermissionRuleView>(owner.cookie, 'permissions/set', {
        role: 'front_desk',
        permission: 'stay.rate_override',
        allowed: true,
        limit: '15',
        reason: 'Weekend corporate rates',
      })
      expect(changed.data).toMatchObject({ limit: '15.00', isDefault: false })

      const kora = await accessFor(frontDesk, koraId)
      expect(() => requireWithinLimit(kora, 'stay.rate_override', '12')).not.toThrow()

      // Another group's front desk keeps the default 10%.
      const otherDesk = await t.signUp('Other Desk')
      await t.addMember(otherId, otherDesk, 'front_desk')
      const other = await accessFor(otherDesk, otherId)
      expect(() => requireWithinLimit(other, 'stay.rate_override', '12')).toThrow(
        ApprovalRequiredError,
      )

      const page = await t.rpc<Page<AuditEventView>>(owner.cookie, 'audit/list', {
        entityType: 'permission',
      })
      expect(page.data.items[0]).toMatchObject({
        action: 'permission.changed',
        reason: 'Weekend corporate rates',
        before: {
          role: 'front_desk',
          permission: 'stay.rate_override',
          allowed: true,
          limit: '10',
        },
        after: {
          role: 'front_desk',
          permission: 'stay.rate_override',
          allowed: true,
          limit: '15.00',
        },
      })
    })

    it('can take a permission away from a role', async () => {
      await t.rpc(owner.cookie, 'permissions/set', {
        role: 'general_manager',
        permission: 'audit.view',
        allowed: false,
        limit: null,
        reason: 'Audit log is for finance only here',
      })
      expect((await t.rpc(generalManager.cookie, 'audit/list', {})).status).toBe(403)
    })
  })
})
