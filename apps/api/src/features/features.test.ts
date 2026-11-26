// Feature switches on the real test database (spec: docs/specs/stage-0-feature-switches.md).

import { ORPCError } from '@orpc/server'
import type { AuditEventView } from '@vento/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadAccess, requireFeature } from '../tenancy/access.ts'
import { createTestApp } from '../test/harness.ts'
import { findGroup, listGroupFeatures, SwitchError, switchFeature } from './switches.ts'

const url = process.env.TEST_DATABASE_URL

type Person = { cookie: string; userId: string; email: string }

describe.skipIf(!url)('feature switches', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())

  let owner: Person
  let otherOwner: Person
  let koraId: string
  let otherId: string

  const featuresOf = async (person: Person) =>
    (await t.rpc<{ features: string[] }>(person.cookie, 'organization/current')).data.features

  beforeAll(async () => {
    owner = await t.signUp('Folake Nwosu')
    koraId = await t.createOrganization(owner.cookie, 'Kora Hotels Group')
    otherOwner = await t.signUp('Other Owner')
    otherId = await t.createOrganization(otherOwner.cookie, 'Another Group')
  })

  it('starts with every module off, owners included', async () => {
    expect(await featuresOf(owner)).toEqual([])
  })

  it('switches a module on for one group only, with the reason in that group’s audit log', async () => {
    await switchFeature(t.db, koraId, {
      feature: 'front_desk',
      to: 'on',
      reason: 'Pilot from 1 Dec',
    })
    expect(await featuresOf(owner)).toEqual(['front_desk'])
    expect(await featuresOf(otherOwner)).toEqual([])

    const events = await t.rpc<{ items: AuditEventView[] }>(owner.cookie, 'audit/list', {
      entityType: 'feature',
    })
    expect(events.data.items[0]).toMatchObject({
      action: 'feature.switched_on',
      actorName: 'Vento team',
      reason: 'Pilot from 1 Dec',
      after: { feature: 'front_desk', switch: 'on' },
    })
    const theirs = await t.rpc<{ items: AuditEventView[] }>(otherOwner.cookie, 'audit/list', {
      entityType: 'feature',
    })
    expect(theirs.data.items).toEqual([])
  })

  it('switches off and back to the default', async () => {
    await switchFeature(t.db, koraId, { feature: 'front_desk', to: 'off', reason: 'Pilot paused' })
    expect(await featuresOf(owner)).toEqual([])
    const states = await listGroupFeatures(t.db, koraId)
    expect(states.find((s) => s.feature === 'front_desk')).toMatchObject({
      on: false,
      why: 'switched off',
      reason: 'Pilot paused',
    })
    await switchFeature(t.db, koraId, { feature: 'front_desk', to: 'reset', reason: 'Done' })
    expect((await listGroupFeatures(t.db, koraId))[0]).toMatchObject({ why: 'not released' })
  })

  it('refuses unknown groups and features, and switches without a reason', async () => {
    await expect(findGroup(t.db, 'no-such-group')).rejects.toBeInstanceOf(SwitchError)
    await expect(
      switchFeature(t.db, otherId, { feature: 'spa', to: 'on', reason: 'testing' }),
    ).rejects.toThrow('Unknown feature "spa"')
    await expect(
      switchFeature(t.db, otherId, { feature: 'finance', to: 'on', reason: ' ' }),
    ).rejects.toThrow('Give a reason')
  })

  it('refuses a switched-off module on the server, before anything else', async () => {
    const access = await loadAccess(t.db, koraId, { id: owner.userId, name: 'Folake Nwosu' })
    if (!access) throw new Error('owner has no access')
    let refused: unknown
    try {
      requireFeature(access, 'restaurant_pos')
    } catch (error) {
      refused = error
    }
    expect(refused).toBeInstanceOf(ORPCError)
    expect((refused as ORPCError<string, { code: string }>).data).toEqual({
      code: 'FEATURE_OFF',
      feature: 'restaurant_pos',
    })

    await switchFeature(t.db, koraId, { feature: 'restaurant_pos', to: 'on', reason: 'Pilot' })
    const after = await loadAccess(t.db, koraId, { id: owner.userId, name: 'Folake Nwosu' })
    expect(() => after && requireFeature(after, 'restaurant_pos')).not.toThrow()
  })

  it('turns everything on for development and browser tests', async () => {
    const access = await loadAccess(
      t.db,
      otherId,
      { id: otherOwner.userId, name: 'Other Owner' },
      { allFeatures: true },
    )
    expect(access?.features).toHaveLength(10)
  })
})
