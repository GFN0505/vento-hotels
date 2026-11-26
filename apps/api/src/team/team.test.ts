// Invites, joining, and managing members, on the real test database through the real HTTP flow
// (spec: docs/specs/stage-0-team-and-roles.md, decision 0020).
import type {
  AuditEventView,
  Entity,
  InvitationPreview,
  InvitationView,
  MemberView,
  Property,
} from '@vento/shared'
import { newId } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { invitations } from '../db/schema/auth.ts'
import { ABUJA_ADDRESS } from '../test/addresses.ts'
import { createTestApp } from '../test/harness.ts'

const url = process.env.TEST_DATABASE_URL

type Page<T> = { items: T[]; total: number }
type Person = { cookie: string; userId: string; email: string }
const NEW_PASSWORD = 'Joining-pass-42!'

describe.skipIf(!url)('team: invites and members', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())

  let owner: Person
  let groupAdmin: Person
  let frontDesk: Person
  let otherOwner: Person
  let koraId: string
  let victoriaIsland: Property
  let abuja: Property

  const freshEmail = (who: string) => `${who}.${newId().slice(-10)}@example.test`
  const tokenFor = (email: string) => {
    const link = t.email.lastTo(email)?.text.match(/\/join\/([A-Za-z0-9_-]{43})/)?.[1]
    if (!link) throw new Error(`no invite email for ${email}`)
    return link
  }
  const signInAs = async (email: string, password: string) => {
    const response = await t.call('/api/auth/sign-in/email', { body: { email, password } })
    expect(response.status).toBe(200)
    const cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    return cookie
  }
  const setActive = (cookie: string, organizationId: string) =>
    t.call('/api/auth/organization/set-active', { cookie, body: { organizationId } })
  const memberByEmail = async (email: string) => {
    const page = await t.rpc<Page<MemberView>>(owner.cookie, 'members/list', { search: email })
    const member = page.data.items.find((m) => m.email === email)
    if (!member) throw new Error(`${email} is not a member`)
    return member
  }
  const auditFor = async (entityId: string) =>
    (await t.rpc<Page<AuditEventView>>(owner.cookie, 'audit/list', { entityId })).data.items

  beforeAll(async () => {
    owner = await t.signUp('Folake Nwosu')
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
        ...ABUJA_ADDRESS,
      })
    ).data
    groupAdmin = await t.signUp('Emeka Kalu')
    await t.addMember(koraId, groupAdmin, 'group_admin')
    frontDesk = await t.signUp('Chidi Eze')
    await t.addMember(koraId, frontDesk, 'front_desk')
    otherOwner = await t.signUp('Other Owner')
    await t.createOrganization(otherOwner.cookie, 'Another Hotel Group')
  })

  describe('inviting and joining', () => {
    it('lets a new person join from the link in one step, with the hotels they were given', async () => {
      const email = freshEmail('ada.nwosu')
      const sent = await t.rpc<{ invited: number }>(owner.cookie, 'invitations/create', {
        emails: [email],
        role: 'front_desk',
        access: { allProperties: false, propertyIds: [victoriaIsland.id] },
      })
      expect(sent.status).toBe(200)
      expect(sent.data.invited).toBe(1)
      expect(t.email.lastTo(email)?.subject).toBe(
        'Folake Nwosu invited you to Kora Hotels Group on Vento Hotels',
      )

      const token = tokenFor(email)
      const preview = await t.rpc<InvitationPreview>(undefined, 'invitations/preview', { token })
      expect(preview.data).toMatchObject({
        status: 'pending',
        email,
        organizationName: 'Kora Hotels Group',
        invitedBy: 'Folake Nwosu',
        role: 'front_desk',
        allProperties: false,
        propertyNames: ['Kora Victoria Island'],
        hasAccount: false,
      })

      const joined = await t.rpc(undefined, 'invitations/join', {
        token,
        name: 'Ada Nwosu',
        password: NEW_PASSWORD,
      })
      expect(joined.status).toBe(200)

      // No second confirmation email: she can sign in straight away and sees only her hotel.
      const cookie = await signInAs(email, NEW_PASSWORD)
      await setActive(cookie, koraId)
      const hotels = await t.rpc<Page<Property>>(cookie, 'properties/list', {})
      expect(hotels.data.items.map((p) => p.name)).toEqual(['Kora Victoria Island'])

      const member = await memberByEmail(email)
      expect(member).toMatchObject({ name: 'Ada Nwosu', role: 'front_desk', allProperties: false })
      const joinedEvent = (await auditFor(member.id)).find((e) => e.action === 'member.joined')
      expect(joinedEvent?.actorName).toBe('Ada Nwosu')
    })

    it('works once: the same link can never be used again', async () => {
      const email = freshEmail('once')
      await t.rpc(owner.cookie, 'invitations/create', {
        emails: [email],
        role: 'cashier',
        access: { allProperties: true },
      })
      const token = tokenFor(email)
      const first = await t.rpc(undefined, 'invitations/join', {
        token,
        name: 'First Person',
        password: NEW_PASSWORD,
      })
      expect(first.status).toBe(200)
      const second = await t.rpc(undefined, 'invitations/join', {
        token,
        name: 'Second Person',
        password: NEW_PASSWORD,
      })
      expect(second.status).toBe(409)
      expect(second.data.message).toBe(
        "This invite can't be used any more. Ask Folake Nwosu for a new one.",
      )
      const preview = await t.rpc<InvitationPreview>(undefined, 'invitations/preview', { token })
      expect(preview.data).toEqual({ status: 'unavailable', invitedBy: 'Folake Nwosu' })
    })

    it('treats unknown, expired and cancelled links the same', async () => {
      const unknown = await t.rpc<InvitationPreview>(undefined, 'invitations/preview', {
        token: 'a'.repeat(43),
      })
      expect(unknown.data).toEqual({ status: 'unavailable', invitedBy: null })

      const expiredEmail = freshEmail('expired')
      await t.rpc(owner.cookie, 'invitations/create', {
        emails: [expiredEmail],
        role: 'waiter',
        access: { allProperties: true },
      })
      await t.db
        .update(invitations)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(invitations.email, expiredEmail))
      const expired = await t.rpc<InvitationPreview>(undefined, 'invitations/preview', {
        token: tokenFor(expiredEmail),
      })
      expect(expired.data.status).toBe('unavailable')
      const tooLate = await t.rpc(undefined, 'invitations/join', {
        token: tokenFor(expiredEmail),
        name: 'Too Late',
        password: NEW_PASSWORD,
      })
      expect(tooLate.status).toBe(409)

      const cancelledEmail = freshEmail('cancelled')
      await t.rpc(owner.cookie, 'invitations/create', {
        emails: [cancelledEmail],
        role: 'waiter',
        access: { allProperties: true },
      })
      const list = await t.rpc<Page<InvitationView>>(owner.cookie, 'invitations/list', {
        pageSize: 100,
      })
      const invite = list.data.items.find((i) => i.email === cancelledEmail)
      expect(invite?.status).toBe('pending')
      await t.rpc(owner.cookie, 'invitations/cancel', { id: invite?.id })
      const cancelled = await t.rpc<InvitationPreview>(undefined, 'invitations/preview', {
        token: tokenFor(cancelledEmail),
      })
      expect(cancelled.data.status).toBe('unavailable')
    })

    it('refreshes a pending invite when the same email is invited again, and resends with a new link', async () => {
      const email = freshEmail('again')
      await t.rpc(owner.cookie, 'invitations/create', {
        emails: [email],
        role: 'waiter',
        access: { allProperties: true },
      })
      const firstToken = tokenFor(email)
      await t.rpc(owner.cookie, 'invitations/create', {
        emails: [email],
        role: 'cashier',
        access: { allProperties: false, propertyIds: [abuja.id] },
      })
      const list = await t.rpc<Page<InvitationView>>(owner.cookie, 'invitations/list', {
        pageSize: 100,
      })
      const mine = list.data.items.filter((i) => i.email === email)
      expect(mine).toHaveLength(1)
      expect(mine[0]).toMatchObject({ role: 'cashier', properties: [{ name: 'Kora Abuja' }] })
      const old = await t.rpc<InvitationPreview>(undefined, 'invitations/preview', {
        token: firstToken,
      })
      expect(old.data.status).toBe('unavailable')

      const secondToken = tokenFor(email)
      await t.rpc(owner.cookie, 'invitations/resend', { id: mine[0]?.id })
      expect(tokenFor(email)).not.toBe(secondToken)
      const stale = await t.rpc<InvitationPreview>(undefined, 'invitations/preview', {
        token: secondToken,
      })
      expect(stale.data.status).toBe('unavailable')
    })

    it('skips people who are already in the group', async () => {
      const result = await t.rpc<{ invited: number; alreadyMembers: string[] }>(
        owner.cookie,
        'invitations/create',
        { emails: [frontDesk.email], role: 'front_desk', access: { allProperties: true } },
      )
      expect(result.data).toEqual({ invited: 0, alreadyMembers: [frontDesk.email], notSent: [] })
    })

    it('lets someone with an account accept after signing in, and only as the invited email', async () => {
      const existing = await t.signUp('Kemi Adeyemi')
      await t.rpc(owner.cookie, 'invitations/create', {
        emails: [existing.email],
        role: 'general_manager',
        access: { allProperties: false, propertyIds: [abuja.id] },
      })
      const token = tokenFor(existing.email)
      const preview = await t.rpc<InvitationPreview>(undefined, 'invitations/preview', { token })
      expect(preview.data).toMatchObject({ status: 'pending', hasAccount: true })

      const asSomeoneElse = await t.rpc(frontDesk.cookie, 'invitations/accept', { token })
      expect(asSomeoneElse.status).toBe(403)
      const viaJoin = await t.rpc(undefined, 'invitations/join', {
        token,
        name: 'Impostor',
        password: NEW_PASSWORD,
      })
      expect(viaJoin.status).toBe(409)

      const accepted = await t.rpc<{ organizationId: string }>(
        existing.cookie,
        'invitations/accept',
        { token },
      )
      expect(accepted.data.organizationId).toBe(koraId)
      expect(await memberByEmail(existing.email)).toMatchObject({
        role: 'general_manager',
        properties: [{ name: 'Kora Abuja' }],
      })
    })
  })

  describe('who may do what', () => {
    it('keeps owners and group admins for owners to create', async () => {
      const byAdmin = await t.rpc(groupAdmin.cookie, 'invitations/create', {
        emails: [freshEmail('wannabe')],
        role: 'owner',
        access: { allProperties: true },
      })
      expect(byAdmin.status).toBe(403)
      const asAdmin = await t.rpc(groupAdmin.cookie, 'invitations/create', {
        emails: [freshEmail('admin2')],
        role: 'group_admin',
        access: { allProperties: true },
      })
      expect(asAdmin.status).toBe(403)
      const staff = await t.rpc(groupAdmin.cookie, 'invitations/create', {
        emails: [freshEmail('staff')],
        role: 'room_attendant',
        access: { allProperties: false, propertyIds: [victoriaIsland.id] },
      })
      expect(staff.status).toBe(200)

      const ownerMember = await memberByEmail(owner.email)
      const demote = await t.rpc(groupAdmin.cookie, 'members/update', {
        memberId: ownerMember.id,
        role: 'viewer',
        access: { allProperties: true },
      })
      expect(demote.status).toBe(403)
      const remove = await t.rpc(groupAdmin.cookie, 'members/remove', {
        memberId: ownerMember.id,
      })
      expect(remove.status).toBe(403)
    })

    it("doesn't let anyone change or remove themselves, so a group always keeps its owner", async () => {
      const me = await memberByEmail(owner.email)
      expect(me.isYou).toBe(true)
      const change = await t.rpc(owner.cookie, 'members/update', {
        memberId: me.id,
        role: 'viewer',
        access: { allProperties: true },
      })
      expect(change.status).toBe(400)
      const remove = await t.rpc(owner.cookie, 'members/remove', { memberId: me.id })
      expect(remove.status).toBe(400)
    })

    it('refuses staff without setup access', async () => {
      for (const [path, input] of [
        ['members/list', {}],
        ['invitations/list', {}],
        [
          'invitations/create',
          { emails: [freshEmail('x')], role: 'waiter', access: { allProperties: true } },
        ],
      ] as const) {
        const response = await t.rpc(frontDesk.cookie, path, input)
        expect(response.status, path).toBe(403)
      }
    })

    it('closes Better Auth’s own invite and member endpoints over HTTP', async () => {
      for (const path of [
        '/api/auth/organization/invite-member',
        '/api/auth/organization/update-member-role',
        '/api/auth/organization/remove-member',
        '/api/auth/organization/accept-invitation',
        '/api/auth/organization/update',
        '/api/auth/organization/leave',
      ]) {
        const response = await t.call(path, {
          cookie: owner.cookie,
          body: { email: freshEmail('x'), role: 'owner', memberIdOrEmail: 'x', invitationId: 'x' },
        })
        expect(response.status, path).toBe(404)
      }
    })

    it("closes Better Auth's member and invite listings, which would skip Vento's rules", async () => {
      for (const path of [
        '/api/auth/organization/list-members',
        '/api/auth/organization/list-invitations',
        '/api/auth/organization/get-full-organization',
      ]) {
        const response = await t.call(path, { cookie: frontDesk.cookie })
        expect(response.status, path).toBe(404)
      }
      // What the web app needs still works.
      const list = await t.call('/api/auth/organization/list', { cookie: frontDesk.cookie })
      expect(list.status).toBe(200)
    })
  })

  it('refuses very long passwords before doing any work', async () => {
    const response = await t.rpc(undefined, 'invitations/join', {
      token: 'a'.repeat(43),
      name: 'Long Password',
      password: `Aa1!${'x'.repeat(200)}`,
    })
    expect(response.status).toBe(400)
  })

  describe('changing and removing members', () => {
    it('changes role and hotels together, recording each change with who made it', async () => {
      const person = await t.signUp('Musa Ibrahim')
      await t.addMember(koraId, person, 'waiter')
      const member = await memberByEmail(person.email)

      const updated = await t.rpc<MemberView>(owner.cookie, 'members/update', {
        memberId: member.id,
        role: 'cashier',
        access: { allProperties: false, propertyIds: [abuja.id, victoriaIsland.id] },
      })
      expect(updated.status).toBe(200)
      expect(updated.data).toMatchObject({
        role: 'cashier',
        allProperties: false,
        properties: [{ name: 'Kora Abuja' }, { name: 'Kora Victoria Island' }],
      })
      const actions = (await auditFor(member.id)).map((e) => [e.action, e.actorName])
      expect(actions).toEqual(
        expect.arrayContaining([
          ['member.role_changed', 'Folake Nwosu'],
          ['member.property_access_changed', 'Folake Nwosu'],
        ]),
      )
    })

    it('removes someone: they lose access at once, and the audit log keeps who they were', async () => {
      const person = await t.signUp('Femi Lawal')
      await t.addMember(koraId, person, 'front_desk')
      const member = await memberByEmail(person.email)
      const removed = await t.rpc(owner.cookie, 'members/remove', { memberId: member.id })
      expect(removed.status).toBe(200)

      const after = await t.rpc(person.cookie, 'properties/list', {})
      expect(after.status).toBe(403)
      const event = (await auditFor(member.id)).find((e) => e.action === 'member.removed')
      expect(event?.before).toMatchObject({ name: 'Femi Lawal', role: 'front_desk' })
    })

    it('lets a manager limited to some hotels manage only those', async () => {
      // The owner lets general managers manage people; Kemi runs Abuja only.
      await t.rpc(owner.cookie, 'permissions/set', {
        role: 'general_manager',
        permission: 'setup.manage',
        allowed: true,
        reason: 'GMs hire their own staff',
      })
      const gm = await t.signUp('Bola Ojo')
      await t.addMember(koraId, gm, 'general_manager')
      await t.rpc(owner.cookie, 'members/setPropertyAccess', {
        memberId: (await memberByEmail(gm.email)).id,
        allProperties: false,
        propertyIds: [abuja.id],
      })

      const toAbuja = await t.rpc(gm.cookie, 'invitations/create', {
        emails: [freshEmail('abuja.staff')],
        role: 'waiter',
        access: { allProperties: false, propertyIds: [abuja.id] },
      })
      expect(toAbuja.status).toBe(200)
      const toVictoriaIsland = await t.rpc(gm.cookie, 'invitations/create', {
        emails: [freshEmail('vi.staff')],
        role: 'waiter',
        access: { allProperties: false, propertyIds: [victoriaIsland.id] },
      })
      expect(toVictoriaIsland.status).toBe(403)
      const wholeGroup = await t.rpc(gm.cookie, 'invitations/create', {
        emails: [freshEmail('everywhere')],
        role: 'waiter',
        access: { allProperties: true },
      })
      expect(wholeGroup.status).toBe(403)

      // They see only people limited to Abuja, never the owner or Victoria Island staff.
      const seen = await t.rpc<Page<MemberView>>(gm.cookie, 'members/list', { pageSize: 100 })
      for (const member of seen.data.items) {
        expect(member.allProperties).toBe(false)
        expect(member.properties.every((p) => p.id === abuja.id)).toBe(true)
      }
      const ownerMember = await memberByEmail(owner.email)
      const touchOwner = await t.rpc(gm.cookie, 'members/remove', { memberId: ownerMember.id })
      expect(touchOwner.status).toBe(404)

      // Nor can they widen their own access through the older property-access call.
      const widenSelf = await t.rpc(gm.cookie, 'members/setPropertyAccess', {
        memberId: (await memberByEmail(gm.email)).id,
        allProperties: true,
      })
      expect(widenSelf.status).toBe(400)

      // Nor hand out a role that can do more than they can: finance has unlimited refunds and
      // payroll approval, a GM doesn't.
      const asFinance = await t.rpc(gm.cookie, 'invitations/create', {
        emails: [freshEmail('my.other.account')],
        role: 'finance',
        access: { allProperties: false, propertyIds: [abuja.id] },
      })
      expect(asFinance.status).toBe(403)
      const colleague = seen.data.items.find((member) => !member.isYou)
      expect(colleague).toBeDefined()
      const promote = await t.rpc(gm.cookie, 'members/update', {
        memberId: colleague?.id,
        role: 'finance',
        access: { allProperties: false, propertyIds: [abuja.id] },
      })
      expect(promote.status).toBe(403)

      // Nor replace an invite someone else sent to the same email.
      const ownersInvite = freshEmail('owners.pick')
      await t.rpc(owner.cookie, 'invitations/create', {
        emails: [ownersInvite],
        role: 'waiter',
        access: { allProperties: true },
      })
      const hijack = await t.rpc(gm.cookie, 'invitations/create', {
        emails: [ownersInvite],
        role: 'waiter',
        access: { allProperties: false, propertyIds: [abuja.id] },
      })
      expect(hijack.status).toBe(409)

      await t.rpc(owner.cookie, 'permissions/set', {
        role: 'general_manager',
        permission: 'setup.manage',
        allowed: false,
        reason: 'Back to the template',
      })
    })

    it("stops an invite working once its sender can't give it any more", async () => {
      const admin = await t.signUp('Temporary Admin')
      await t.addMember(koraId, admin, 'group_admin')
      const email = freshEmail('orphan')
      await t.rpc(admin.cookie, 'invitations/create', {
        emails: [email],
        role: 'waiter',
        access: { allProperties: true },
      })
      const token = tokenFor(email)
      await t.rpc(owner.cookie, 'members/remove', {
        memberId: (await memberByEmail(admin.email)).id,
      })
      const preview = await t.rpc<InvitationPreview>(undefined, 'invitations/preview', { token })
      expect(preview.data).toEqual({ status: 'unavailable', invitedBy: 'Temporary Admin' })
      const join = await t.rpc(undefined, 'invitations/join', {
        token,
        name: 'Too Late',
        password: NEW_PASSWORD,
      })
      expect(join.status).toBe(409)
    })

    it('keeps an owner: owners can step each other down, but never the last one', async () => {
      const second = await t.signUp('Second Owner')
      await t.addMember(koraId, second, 'owner')
      const secondMember = await memberByEmail(second.email)
      const demote = await t.rpc(owner.cookie, 'members/update', {
        memberId: secondMember.id,
        role: 'group_admin',
        access: { allProperties: true },
      })
      expect(demote.status).toBe(200)
    })
  })

  describe('organization isolation', () => {
    it("can't see, change or cancel another group's members and invites", async () => {
      const victim = await memberByEmail(frontDesk.email)
      const update = await t.rpc(otherOwner.cookie, 'members/update', {
        memberId: victim.id,
        role: 'viewer',
        access: { allProperties: true },
      })
      expect(update.status).toBe(404)
      const remove = await t.rpc(otherOwner.cookie, 'members/remove', { memberId: victim.id })
      expect(remove.status).toBe(404)

      const email = freshEmail('isolated')
      await t.rpc(owner.cookie, 'invitations/create', {
        emails: [email],
        role: 'waiter',
        access: { allProperties: true },
      })
      const list = await t.rpc<Page<InvitationView>>(owner.cookie, 'invitations/list', {
        pageSize: 100,
      })
      const invite = list.data.items.find((i) => i.email === email)
      const cancel = await t.rpc(otherOwner.cookie, 'invitations/cancel', { id: invite?.id })
      expect(cancel.status).toBe(404)

      const theirs = await t.rpc<Page<MemberView>>(otherOwner.cookie, 'members/list', {})
      expect(theirs.data.items.map((m) => m.email)).toEqual([otherOwner.email])

      // Inviting a hotel from another group is refused.
      const foreignHotel = await t.rpc(otherOwner.cookie, 'invitations/create', {
        emails: [freshEmail('foreign')],
        role: 'waiter',
        access: { allProperties: false, propertyIds: [victoriaIsland.id] },
      })
      expect(foreignHotel.status).toBe(400)
    })
  })

  it('tells the web app what the signed-in member may do', async () => {
    const mine = await t.rpc<{ permissions: string[] }>(owner.cookie, 'organization/current')
    expect(mine.data.permissions).toContain('permissions.manage')
    const theirs = await t.rpc<{ permissions: string[] }>(frontDesk.cookie, 'organization/current')
    expect(theirs.data.permissions).not.toContain('setup.manage')
    expect(theirs.data.permissions).toContain('reservation.manage')
  })
})
