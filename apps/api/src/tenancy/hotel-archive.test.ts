// Closing and reopening a hotel (spec: stage-1-hotels-and-companies.md, "Archive a hotel").
import type { ArchivePreview, AuditEventView, DeviceView, Property } from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { invitations } from '../db/schema/auth.ts'
import { devices, memberProperties } from '../db/schema/tenancy.ts'
import { LAGOS_ADDRESS } from '../test/addresses.ts'
import { createTestApp } from '../test/harness.ts'
import {
  events,
  type Kora,
  koraGroup,
  lastEvent,
  limitTo,
  type Page,
  type Problem,
  setLive,
} from './testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('archiving and restoring hotels', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let kora: Kora
  let counter = 0

  const add = async () => {
    counter++
    const added = await t.rpc<Property>(kora.owner.cookie, 'properties/create', {
      entityId: kora.company.id,
      name: `Kora Port Harcourt ${counter}`,
      ...LAGOS_ADDRESS,
    })
    return added.data
  }
  const archive = (id: string, reason = 'Lease ended 30 Nov 2026', cookie = kora.owner.cookie) =>
    t.rpc<Property & Problem>(cookie, 'properties/archive', { id, reason })
  const register = (propertyId: string) =>
    t.rpc<DeviceView>(kora.owner.cookie, 'devices/register', {
      name: `FD-PH-${counter}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'front_desk',
      propertyId,
    })
  const invite = (email: string, propertyIds: string[]) =>
    t.rpc(kora.owner.cookie, 'invitations/create', {
      emails: [email],
      role: 'front_desk',
      access: { allProperties: false, propertyIds },
    })
  const inviteStatus = async (email: string) =>
    (
      await t.db
        .select({ status: invitations.status })
        .from(invitations)
        .where(and(eq(invitations.organizationId, kora.orgId), eq(invitations.email, email)))
    )[0]?.status

  beforeAll(async () => {
    kora = await koraGroup(t)
  })

  it('previews what archiving does: devices, people and invites for this hotel alone', async () => {
    const ph = await add()
    await register(ph.id)
    const frontDesk = await t.signUp('Kemi Ade')
    await t.addMember(kora.orgId, frontDesk, 'front_desk')
    const member = await t.rpc<{ member: { id: string } }>(frontDesk.cookie, 'organization/current')
    await limitTo(t, kora.owner, { ...frontDesk, memberId: member.data.member.id }, [ph.id])
    await invite(`only.${counter}@example.test`, [ph.id])
    await invite(`both.${counter}@example.test`, [ph.id, kora.abuja.id])
    const preview = await t.rpc<ArchivePreview>(kora.owner.cookie, 'properties/archivePreview', {
      id: ph.id,
    })
    expect(preview.data).toEqual({
      rooms: 0,
      devices: 1,
      peopleOnlyHere: 1,
      invitationsOnlyHere: 1,
      lastHotel: false,
      blockers: [],
    })
  })

  it('revokes its devices, cancels invites for it alone and keeps everything else', async () => {
    const ph = await add()
    const device = await register(ph.id)
    const frontDesk = await t.signUp('Sola Bakare')
    await t.addMember(kora.orgId, frontDesk, 'front_desk')
    const member = await t.rpc<{ member: { id: string } }>(frontDesk.cookie, 'organization/current')
    await limitTo(t, kora.owner, { ...frontDesk, memberId: member.data.member.id }, [ph.id])
    await invite(`alone.${counter}@example.test`, [ph.id])
    await invite(`shared.${counter}@example.test`, [ph.id, kora.abuja.id])

    const archived = await archive(ph.id)
    expect(archived.data).toMatchObject({ status: 'archived', archivedAt: expect.any(String) })
    const [revoked] = await t.db
      .select({ revokedReason: devices.revokedReason })
      .from(devices)
      .where(eq(devices.id, device.data.id))
    expect(revoked).toMatchObject({ revokedReason: 'Hotel archived: Lease ended 30 Nov 2026' })
    // An archived hotel's devices leave Settings › Devices; their history stays in the audit log.
    const listed = await t.rpc<Page<DeviceView>>(kora.owner.cookie, 'devices/list', {
      pageSize: 100,
    })
    expect(listed.data.items.map((d) => d.id)).not.toContain(device.data.id)
    expect(await inviteStatus(`alone.${counter}@example.test`)).toBe('canceled')
    expect(await inviteStatus(`shared.${counter}@example.test`)).toBe('pending')
    const access = await t.db
      .select({ id: memberProperties.id })
      .from(memberProperties)
      .where(eq(memberProperties.propertyId, ph.id))
    expect(access).toHaveLength(1)
    const theirs = await t.rpc<Page<Property>>(frontDesk.cookie, 'properties/list', {})
    expect(theirs.data.items).toEqual([])
  })

  it('records the archive with its reason, and each side effect linked to it', async () => {
    const ph = await add()
    const device = await register(ph.id)
    await archive(ph.id)
    const archived = await lastEvent(t, kora.owner, 'property', ph.id)
    expect(archived).toMatchObject({
      action: 'property.archived',
      reason: 'Lease ended 30 Nov 2026',
      after: expect.objectContaining({ devicesRevoked: 1, liveProperty: false }),
    })
    expect(archived?.after).not.toHaveProperty('exception')
    expect(await lastEvent(t, kora.owner, 'device', device.data.id)).toMatchObject({
      action: 'device.revoked',
      reason: 'Hotel archived: Lease ended 30 Nov 2026',
      after: { revoked: true, causedBy: archived?.id },
    })
  })

  it('marks archiving and restoring a live hotel as a setup_changed exception', async () => {
    const ph = await add()
    await setLive(t, ph.id, ph.businessDate)
    await archive(ph.id)
    await t.rpc(kora.owner.cookie, 'properties/restore', { id: ph.id, reason: 'Lease renewed' })
    const [restored, archived] = await events(t, kora.owner, 'property', ph.id)
    expect(archived?.after).toMatchObject({ liveProperty: true, exception: 'setup_changed' })
    expect(restored).toMatchObject({
      action: 'property.restored',
      reason: 'Lease renewed',
      after: expect.objectContaining({ exception: 'setup_changed' }),
    })
  })

  it('moves the hotel from the list to the Archived filter, and keeps its name taken', async () => {
    const ph = await add()
    await archive(ph.id)
    const active = await t.rpc<Page<Property>>(kora.owner.cookie, 'properties/list', {})
    expect(active.data.items.some((h) => h.id === ph.id)).toBe(false)
    const archived = await t.rpc<Page<Property>>(kora.owner.cookie, 'properties/list', {
      status: 'archived',
    })
    expect(archived.data.items.some((h) => h.id === ph.id)).toBe(true)
    const again = await t.rpc<Problem>(kora.owner.cookie, 'properties/create', {
      entityId: kora.company.id,
      name: ph.name,
      ...LAGOS_ADDRESS,
    })
    expect(again.data.message).toBe(`${ph.name} is archived. Restore it, or use another name.`)
  })

  it('tells someone who worked there that the hotel was archived', async () => {
    const ph = await add()
    const gm = await t.signUp('Bola Ojo')
    await t.addMember(kora.orgId, gm, 'general_manager')
    const member = await t.rpc<{ member: { id: string } }>(gm.cookie, 'organization/current')
    await limitTo(t, kora.owner, { ...gm, memberId: member.data.member.id }, [ph.id])
    await archive(ph.id)
    const seen = await t.rpc<Problem>(gm.cookie, 'properties/get', { id: ph.id })
    expect(seen.status).toBe(404)
    expect(seen.data).toMatchObject({
      message: 'This hotel was archived.',
      data: { code: 'PROPERTY_ARCHIVED' },
    })
  })

  it('needs a reason, setup rights, and a hotel in the caller’s group', async () => {
    const ph = await add()
    expect((await archive(ph.id, '')).status).toBe(400)
    expect((await archive(ph.id, 'Closing', kora.gm.cookie)).status).toBe(403)
    expect((await archive(kora.otherHotel.id)).status).toBe(404)
    expect((await archive(ph.id, 'Closing', kora.hotelAdmin.cookie)).status).toBe(404)
  })

  it("refuses to archive the group's last hotel, and writes nothing", async () => {
    const audit = () =>
      t.rpc<Page<AuditEventView>>(kora.outsider.cookie, 'audit/list', {}).then((r) => r.data.total)
    const before = await audit()
    const alone = await archive(kora.otherHotel.id, 'Closing', kora.outsider.cookie)
    expect(alone.status).toBe(409)
    expect(alone.data.message).toBe('Another Group needs at least one hotel.')
    expect(await audit()).toBe(before)
  })

  it('lets only one of two archives of the last two hotels succeed', async () => {
    const boss = await t.signUp('Race Owner')
    await t.createOrganization(boss.cookie, `Race Group ${counter}`)
    const company = (
      await t.rpc<{ id: string }>(boss.cookie, 'entities/create', { name: 'Race Ltd' })
    ).data
    const hotels = []
    for (const name of ['Race One', 'Race Two']) {
      const added = await t.rpc<Property>(boss.cookie, 'properties/create', {
        entityId: company.id,
        name,
        ...LAGOS_ADDRESS,
      })
      hotels.push(added.data)
    }
    const results = await Promise.all(
      hotels.map((h) => archive(h.id, 'Closing both at once', boss.cookie)),
    )
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const left = await t.rpc<Page<Property>>(boss.cookie, 'properties/list', {})
    expect(left.data.total).toBe(1)
  })

  it('never leaves a live device at an archived hotel when registering races archiving', async () => {
    for (let round = 0; round < 3; round++) {
      const ph = await add()
      const [registered] = await Promise.all([register(ph.id), archive(ph.id)])
      const devices = await t.rpc<Page<DeviceView>>(kora.owner.cookie, 'devices/list', {
        pageSize: 100,
      })
      const live = devices.data.items.filter((d) => d.propertyId === ph.id && !d.revokedAt)
      expect(live).toEqual([])
      // Either the device came first and was revoked with the hotel, or it was refused.
      expect([200, 400, 404]).toContain(registered.status)
    }
  })

  it('restores a hotel that never went live on today’s date, with its access back', async () => {
    const ph = await add()
    await archive(ph.id)
    const restored = await t.rpc<Property>(kora.owner.cookie, 'properties/restore', {
      id: ph.id,
      reason: 'Reopening',
    })
    expect(restored.data).toMatchObject({ status: 'setting_up', archivedAt: null, version: 3 })
    expect(restored.data.businessDate).toBe(ph.businessDate)
  })

  it('asks for an active company when the hotel’s company was archived meanwhile', async () => {
    const companyName = `Kora Rivers ${counter} Ltd`
    const company = (
      await t.rpc<{ id: string }>(kora.owner.cookie, 'entities/create', { name: companyName })
    ).data
    const ph = await add()
    await t.rpc(kora.owner.cookie, 'properties/update', {
      id: ph.id,
      version: 1,
      entityId: company.id,
    })
    await archive(ph.id)
    await t.rpc(kora.owner.cookie, 'entities/archive', { id: company.id, reason: 'Dissolved' })
    const refused = await t.rpc<Problem>(kora.owner.cookie, 'properties/restore', {
      id: ph.id,
      reason: 'Reopening',
    })
    expect(refused.data).toMatchObject({
      message: `${companyName} was archived. Choose another company.`,
      data: { code: 'ENTITY_ARCHIVED' },
    })
    const restored = await t.rpc<Property>(kora.owner.cookie, 'properties/restore', {
      id: ph.id,
      reason: 'Reopening',
      entityId: kora.company.id,
    })
    expect(restored.data).toMatchObject({ status: 'setting_up', entityId: kora.company.id })
  })
})
