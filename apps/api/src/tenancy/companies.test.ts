// Companies (the group's legal entities): add, edit, archive and restore, with uniqueness of name,
// RC number and TIN, scoping for hotel-limited admins, and audit events.
import { addDays, type Entity, type Property } from '@vento/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LAGOS_ADDRESS } from '../test/addresses.ts'
import { createTestApp } from '../test/harness.ts'
import { applyScheduledVatChange } from './scheduled-entity.ts'
import { type Kora, koraGroup, lastEvent, type Page, type Problem, setLive } from './testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('companies', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let kora: Kora
  let counter = 0

  const create = (input: Record<string, unknown>, cookie = kora.owner.cookie) =>
    t.rpc<Entity & Problem>(cookie, 'entities/create', input)
  const next = () => {
    counter++
    return {
      name: `Kora Company ${counter} Ltd`,
      rcNumber: `${1_300_000 + counter}`,
      tin: `${30_000_000 + counter}-0001`,
    }
  }
  const update = (input: Record<string, unknown>, cookie = kora.owner.cookie) =>
    t.rpc<Entity & Problem>(cookie, 'entities/update', input)

  beforeAll(async () => {
    kora = await koraGroup(t)
  })

  it('stores the RC number with its prefix and records who added the company', async () => {
    const fields = next()
    const created = await create({ ...fields, vatRegistered: true })
    expect(created.data).toMatchObject({
      rcNumber: `RC ${fields.rcNumber}`,
      tin: fields.tin,
      vatRegistered: true,
      baseCurrency: 'NGN',
      status: 'active',
      version: 1,
      hotels: [],
      canEdit: true,
    })
    expect(await lastEvent(t, kora.owner, 'entity', created.data.id)).toMatchObject({
      action: 'entity.created',
      actorName: 'Adaeze Okafor',
      after: expect.objectContaining({ rcNumber: `RC ${fields.rcNumber}` }),
    })
  })

  it('refuses a name, RC number or TIN another company in the group has', async () => {
    const first = next()
    const owner = (await create(first)).data
    const name = await create({ ...next(), name: first.name.toUpperCase() })
    expect(name.data.message).toBe(`${first.name} is already a company in this group.`)
    const rc = await create({ ...next(), rcNumber: `rc-${first.rcNumber}` })
    expect(rc.data.message).toBe(`RC ${first.rcNumber} belongs to ${owner.name}.`)
    const tin = await create({ ...next(), tin: first.tin.replace('-', '') })
    expect(tin.status).toBe(409)
    expect(tin.data.data).toMatchObject({ code: 'TIN_TAKEN' })
  })

  it('lets another group use the same RC number and TIN', async () => {
    const fields = next()
    await create(fields)
    const elsewhere = await create(fields, kora.outsider.cookie)
    expect(elsewhere.status).toBe(200)
  })

  it('refuses badly formed RC numbers and TINs', async () => {
    expect((await create({ ...next(), rcNumber: 'XY 123' })).status).toBe(400)
    expect((await create({ ...next(), tin: '1234' })).status).toBe(400)
  })

  it('lists companies with the hotels each owns, only the ones the caller can see', async () => {
    const owner = await t.rpc<Page<Entity>>(kora.owner.cookie, 'entities/list', {})
    expect(owner.data.items.find((e) => e.id === kora.company.id)).toMatchObject({
      hotels: [
        { id: kora.abuja.id, name: 'Kora Abuja' },
        { id: kora.vi.id, name: 'Kora Victoria Island' },
      ],
      otherHotels: 0,
      canEdit: true,
    })
    const limited = await t.rpc<Page<Entity>>(kora.hotelAdmin.cookie, 'entities/list', {})
    expect(limited.data.items.find((e) => e.id === kora.company.id)).toMatchObject({
      hotels: [{ id: kora.abuja.id, name: 'Kora Abuja' }],
      otherHotels: 1,
      canEdit: false,
    })
    expect(limited.data.items.some((e) => e.id === kora.otherCompany.id)).toBe(false)
  })

  it('shows only the company that owns the hotel chosen in the top bar', async () => {
    const page = await t.rpc<Page<Entity>>(kora.owner.cookie, 'entities/list', {
      propertyId: kora.abuja.id,
    })
    expect(page.data.items.map((e) => e.id)).toEqual([kora.company.id])
  })

  it('keeps Companies from the GM', async () => {
    const result = await t.rpc<Problem>(kora.gm.cookie, 'entities/list', {})
    expect(result.status).toBe(403)
  })

  it('answers NOT_FOUND for another group’s company', async () => {
    const result = await t.rpc(kora.owner.cookie, 'entities/get', { id: kora.otherCompany.id })
    expect(result.status).toBe(404)
    const changed = await update({ id: kora.otherCompany.id, version: 1, name: 'Mine Ltd' })
    expect(changed.status).toBe(404)
  })

  it('saves only what changed and refuses a save from an older version', async () => {
    const created = (await create(next())).data
    const saved = await update({
      id: created.id,
      version: 1,
      vatRegistered: true,
      name: created.name,
    })
    expect(saved.data).toMatchObject({ vatRegistered: true, version: 2 })
    expect(await lastEvent(t, kora.owner, 'entity', created.id)).toMatchObject({
      action: 'entity.changed',
      before: { vatRegistered: false },
      after: { vatRegistered: true, liveProperty: false },
    })
    const late = await update({ id: created.id, version: 1, tin: null })
    expect(late.status).toBe(409)
    expect(late.data.message).toMatch(/^Adaeze changed .+ at \d\d:\d\d\./)
  })

  it('asks for a reason to change the TIN or VAT of a company with a live hotel', async () => {
    const created = (await create(next())).data
    const added = await t.rpc<Property>(kora.owner.cookie, 'properties/create', {
      entityId: created.id,
      name: `Kora Live ${counter}`,
      ...LAGOS_ADDRESS,
    })
    await setLive(t, added.data.id, added.data.businessDate)
    const noReason = await update({ id: created.id, version: 1, vatRegistered: true })
    expect(noReason.data.data).toMatchObject({ code: 'REASON_REQUIRED' })
    await update({ id: created.id, version: 1, vatRegistered: true, reason: 'Registered with NRS' })
    expect(await lastEvent(t, kora.owner, 'entity', created.id)).toMatchObject({
      reason: 'Registered with NRS',
      after: expect.objectContaining({
        exception: 'setup_changed',
        liveProperties: [{ id: added.data.id, name: added.data.name }],
      }),
    })
  })

  it('schedules a live company’s VAT change for the next business date, applied by night audit', async () => {
    const created = (await create(next())).data
    const added = await t.rpc<Property>(kora.owner.cookie, 'properties/create', {
      entityId: created.id,
      name: `Kora VAT ${counter}`,
      ...LAGOS_ADDRESS,
    })
    await setLive(t, added.data.id, added.data.businessDate)
    const from = addDays(added.data.businessDate, 1)
    const scheduled = await update({
      id: created.id,
      version: 1,
      vatRegistered: true,
      reason: 'NRS',
    })
    expect(scheduled.data).toMatchObject({
      vatRegistered: false,
      pendingVat: { vatRegistered: true, from },
      version: 2,
    })
    const actor = {
      organizationId: kora.orgId,
      userId: kora.owner.userId,
      memberId: kora.owner.memberId,
      userName: 'Adaeze Okafor',
    }
    const apply = (newBusinessDate: string) =>
      t.db.transaction((tx) =>
        applyScheduledVatChange(tx, actor, { id: added.data.id, newBusinessDate }),
      )
    expect(await apply(added.data.businessDate)).toBe(false)
    expect(await apply(from)).toBe(true)
    const applied = (await t.rpc<Entity>(kora.owner.cookie, 'entities/get', { id: created.id }))
      .data
    expect(applied).toMatchObject({ vatRegistered: true, pendingVat: null, version: 3 })
    expect(await lastEvent(t, kora.owner, 'entity', created.id)).toMatchObject({
      action: 'entity.vat_changed',
      after: expect.objectContaining({ exception: 'setup_changed' }),
    })
  })

  it('cancels a scheduled VAT change when the current value is chosen again', async () => {
    const created = (await create(next())).data
    const added = await t.rpc<Property>(kora.owner.cookie, 'properties/create', {
      entityId: created.id,
      name: `Kora VAT Undo ${counter}`,
      ...LAGOS_ADDRESS,
    })
    await setLive(t, added.data.id, added.data.businessDate)
    await update({ id: created.id, version: 1, vatRegistered: true, reason: 'NRS' })
    const back = await update({ id: created.id, version: 2, vatRegistered: false, reason: 'Error' })
    expect(back.data).toMatchObject({ vatRegistered: false, pendingVat: null })
  })

  it("keeps a hotel-limited admin from a company whose closed hotel isn't theirs", async () => {
    const own = (await create(next(), kora.hotelAdmin.cookie)).data
    const elsewhere = await t.rpc<Property>(kora.owner.cookie, 'properties/create', {
      entityId: own.id,
      name: `Kora Closed Elsewhere ${counter}`,
      ...LAGOS_ADDRESS,
    })
    await t.rpc(kora.owner.cookie, 'properties/archive', {
      id: elsewhere.data.id,
      reason: 'Closed',
    })
    const listed = await t.rpc<Entity>(kora.hotelAdmin.cookie, 'entities/get', { id: own.id })
    expect(listed.data).toMatchObject({ hotels: [], otherHotels: 0, canEdit: false })
    const archived = await t.rpc<Problem>(kora.hotelAdmin.cookie, 'entities/archive', {
      id: own.id,
      reason: 'Unused',
    })
    expect(archived.data.data).toMatchObject({ code: 'OUTSIDE_ACCESS' })
  })

  it('bumps the version when a company is archived or restored', async () => {
    const spare = (await create(next())).data
    const archived = await t.rpc<Entity>(kora.owner.cookie, 'entities/archive', {
      id: spare.id,
      reason: 'Dormant',
    })
    expect(archived.data.version).toBe(2)
    const stale = await update({ id: spare.id, version: 1, name: 'Renamed Ltd' })
    expect(stale.status).toBe(409)
  })

  it('lets a hotel-limited admin change a company only if they see all its hotels', async () => {
    const shared = await update(
      { id: kora.company.id, version: 1, tin: '21847390-0009' },
      kora.hotelAdmin.cookie,
    )
    expect(shared.status).toBe(403)
    expect(shared.data.message).toBe(
      'Kora Hospitality Ltd also owns hotels outside your access. Ask the owner.',
    )
    const own = (await create(next(), kora.hotelAdmin.cookie)).data
    expect(
      (await update({ id: own.id, version: 1, vatRegistered: true }, kora.hotelAdmin.cookie))
        .status,
    ).toBe(200)
  })

  it('archives a company only once it owns no active hotel, then restores it', async () => {
    const refused = await t.rpc<Problem>(kora.owner.cookie, 'entities/archive', {
      id: kora.company.id,
      reason: 'Merged',
    })
    expect(refused.data.message).toMatch(
      /^Kora Hospitality Ltd owns \d+ hotels\. Move them to another company first\.$/,
    )
    const spare = (await create(next())).data
    const archived = await t.rpc<Entity>(kora.owner.cookie, 'entities/archive', {
      id: spare.id,
      reason: 'Never traded',
    })
    expect(archived.data.status).toBe('archived')
    expect(await lastEvent(t, kora.owner, 'entity', spare.id)).toMatchObject({
      action: 'entity.archived',
      reason: 'Never traded',
    })
    const restored = await t.rpc<Entity>(kora.owner.cookie, 'entities/restore', {
      id: spare.id,
      reason: 'Trading again',
    })
    expect(restored.data.status).toBe('active')
  })

  it('keeps an archived company out of new hotels', async () => {
    const spare = (await create(next())).data
    await t.rpc(kora.owner.cookie, 'entities/archive', { id: spare.id, reason: 'Closed' })
    const added = await t.rpc<Problem>(kora.owner.cookie, 'properties/create', {
      entityId: spare.id,
      name: `Kora Closed ${counter}`,
      ...LAGOS_ADDRESS,
    })
    expect(added.status).toBe(409)
    expect(added.data.message).toBe(`${spare.name} was archived. Choose another company.`)
  })
})
