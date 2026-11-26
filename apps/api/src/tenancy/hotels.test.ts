// Hotels: list, add and edit, with isolation, scoping, permissions and audit events, against the
// real test database through HTTP (spec: stage-1-hotels-and-companies.md).
import { calendarDateIn, type Property } from '@vento/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ABUJA_ADDRESS, LAGOS_ADDRESS } from '../test/addresses.ts'
import { createTestApp } from '../test/harness.ts'
import { applyScheduledEntityChange } from './scheduled-entity.ts'
import {
  hotel,
  type Kora,
  koraGroup,
  lastEvent,
  type Page,
  type Problem,
  setLive,
} from './testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('hotels', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let kora: Kora
  let counter = 0
  const add = async (overrides: Record<string, unknown> = {}, cookie = kora.owner.cookie) => {
    counter++
    return t.rpc<Property & Problem>(cookie, 'properties/create', {
      entityId: kora.company.id,
      name: `Kora Test ${counter}`,
      ...LAGOS_ADDRESS,
      ...overrides,
    })
  }
  const update = (cookie: string, input: Record<string, unknown>) =>
    t.rpc<Property & Problem>(cookie, 'properties/update', input)

  beforeAll(async () => {
    kora = await koraGroup(t)
  })

  describe('the list', () => {
    it('shows each hotel with its company, status and rooms, sorted by name', async () => {
      const page = await t.rpc<Page<Property>>(kora.owner.cookie, 'properties/list', {})
      expect(page.data).toMatchObject({ page: 1, pageSize: 25 })
      expect(page.data.items.find((h) => h.id === kora.abuja.id)).toMatchObject({
        name: 'Kora Abuja',
        entityName: 'Kora Hospitality Ltd',
        entityDetailsMissing: true,
        status: 'setting_up',
        roomCount: 0,
        logo: null,
        pendingEntity: null,
      })
      const names = page.data.items.map((h) => h.name)
      expect(names).toEqual([...names].sort())
    })

    it('finds hotels by name', async () => {
      const page = await t.rpc<Page<Property>>(kora.owner.cookie, 'properties/list', { q: 'abu' })
      expect(page.data.items.map((h) => h.name)).toEqual(['Kora Abuja'])
    })

    it('shows archived hotels only to people who manage setup', async () => {
      const gm = await t.rpc<Problem>(kora.gm.cookie, 'properties/list', { status: 'archived' })
      expect(gm.status).toBe(403)
      expect(gm.data.message).toBe(
        'Only the owner or a group admin can change hotel details. Ask the owner.',
      )
    })

    it("keeps the GM to Victoria Island and never lists another group's hotels", async () => {
      const gm = await t.rpc<Page<Property>>(kora.gm.cookie, 'properties/list', {})
      expect(gm.data.items.map((h) => h.name)).toEqual(['Kora Victoria Island'])
      const owner = await t.rpc<Page<Property>>(kora.owner.cookie, 'properties/list', {})
      expect(owner.data.items.some((h) => h.id === kora.otherHotel.id)).toBe(false)
    })
  })

  describe('adding a hotel', () => {
    it("starts it on today's date in its own time zone, setting up, with the Lagos times", async () => {
      const added = await add({ timeZone: 'Pacific/Kiritimati' })
      expect(added.status).toBe(200)
      expect(added.data).toMatchObject({
        status: 'setting_up',
        liveSince: null,
        checkInTime: '14:00',
        checkOutTime: '12:00',
        businessDate: calendarDateIn('Pacific/Kiritimati'),
        version: 1,
      })
    })

    it('records who added it, with its details and that it is not live', async () => {
      const added = await add({ checkInTime: '15:00' })
      expect(await lastEvent(t, kora.owner, 'property', added.data.id)).toMatchObject({
        action: 'property.created',
        actorName: 'Adaeze Okafor',
        propertyId: added.data.id,
        after: expect.objectContaining({
          entityName: 'Kora Hospitality Ltd',
          addressLine1: LAGOS_ADDRESS.addressLine1,
          checkInTime: '15:00',
          liveProperty: false,
        }),
      })
    })

    it('needs the full address for every hotel after the first', async () => {
      const result = await add({ addressLine1: undefined, area: undefined, lga: undefined })
      expect(result.status).toBe(400)
      expect(result.data.data).toMatchObject({ code: 'ADDRESS_REQUIRED' })
    })

    it('refuses an LGA from another state, a made-up state and odd times', async () => {
      expect((await add({ lga: 'Obio-Akpor' })).status).toBe(400)
      expect((await add({ state: 'Atlantis' })).status).toBe(400)
      expect((await add({ checkInTime: '14:03' })).status).toBe(400)
    })

    it('refuses a name already used in the group, whatever the capitals', async () => {
      const result = await add({ name: 'kora abuja' })
      expect(result.status).toBe(409)
      expect(result.data.message).toBe('Kora Abuja is already a hotel in this group.')
    })

    it('refuses a company from another group', async () => {
      const result = await add({ entityId: kora.otherCompany.id })
      expect(result.status).toBe(400)
      expect(result.data.message).toBe('Choose a company from this group')
    })

    it('gives a hotel-limited admin the hotel they add, and records it', async () => {
      const added = await add({}, kora.hotelAdmin.cookie)
      expect(added.status).toBe(200)
      const theirs = await t.rpc<Page<Property>>(kora.hotelAdmin.cookie, 'properties/list', {})
      expect(theirs.data.items.map((h) => h.id).sort()).toEqual(
        [kora.abuja.id, added.data.id].sort(),
      )
      const created = await lastEvent(t, kora.owner, 'property', added.data.id)
      expect(await lastEvent(t, kora.owner, 'member', kora.hotelAdmin.memberId)).toMatchObject({
        action: 'member.access_changed',
        after: expect.objectContaining({ causedBy: created?.id }),
      })
    })

    it('lets nobody without setup add a hotel', async () => {
      const result = await add({}, kora.gm.cookie)
      expect(result.status).toBe(403)
    })
  })

  describe('editing a hotel', () => {
    it('saves only what changed, with before and after on the audit event', async () => {
      const current = await hotel(t, kora.owner, kora.vi.id)
      const saved = await update(kora.owner.cookie, {
        id: kora.vi.id,
        version: current.version,
        ...LAGOS_ADDRESS,
        state: 'Lagos',
        checkOutTime: current.checkOutTime,
      })
      expect(saved.status).toBe(200)
      expect(saved.data).toMatchObject({ ...LAGOS_ADDRESS, version: current.version + 1 })
      expect(await lastEvent(t, kora.owner, 'property', kora.vi.id)).toMatchObject({
        action: 'property.changed',
        before: { addressLine1: null, area: null, lga: null },
        after: {
          addressLine1: LAGOS_ADDRESS.addressLine1,
          area: LAGOS_ADDRESS.area,
          lga: LAGOS_ADDRESS.lga,
          liveProperty: false,
        },
      })
    })

    it('refuses a save started from an older version, naming who saved first', async () => {
      const current = await hotel(t, kora.owner, kora.abuja.id)
      await update(kora.owner.cookie, {
        id: kora.abuja.id,
        version: current.version,
        checkInTime: '13:00',
      })
      const late = await update(kora.owner.cookie, {
        id: kora.abuja.id,
        version: current.version,
        checkInTime: '15:00',
      })
      expect(late.status).toBe(409)
      expect(late.data.message).toMatch(
        /^Adaeze changed Kora Abuja at \d\d:\d\d\. Reload to see the change, then save again\.$/,
      )
      expect((await hotel(t, kora.owner, kora.abuja.id)).checkInTime).toBe('13:00')
    })

    it('refuses a state change that leaves the LGA in another state', async () => {
      const current = await hotel(t, kora.owner, kora.abuja.id)
      const moved = await update(kora.owner.cookie, {
        id: kora.abuja.id,
        version: current.version,
        state: 'Rivers',
      })
      expect(moved.status).toBe(400)
      expect(moved.data.data).toMatchObject({ code: 'LGA_NOT_IN_STATE' })
    })

    it('resets the business date with the time zone before go-live, and fixes the zone after', async () => {
      const added = await add()
      const moved = await update(kora.owner.cookie, {
        id: added.data.id,
        version: 1,
        timeZone: 'Pacific/Kiritimati',
      })
      expect(moved.data.businessDate).toBe(calendarDateIn('Pacific/Kiritimati'))
      await setLive(t, added.data.id, moved.data.businessDate)
      const fixed = await update(kora.owner.cookie, {
        id: added.data.id,
        version: 2,
        timeZone: 'Africa/Lagos',
      })
      expect(fixed.data.message).toBe('The time zone is fixed once a hotel is live.')
    })

    it('lets the GM change only check-in and check-out at their hotel', async () => {
      const current = await hotel(t, kora.owner, kora.vi.id)
      const times = await update(kora.gm.cookie, {
        id: kora.vi.id,
        version: current.version,
        name: current.name,
        checkOutTime: '11:00',
      })
      expect(times.status).toBe(200)
      expect(times.data.checkOutTime).toBe('11:00')
      const renamed = await update(kora.gm.cookie, {
        id: kora.vi.id,
        version: times.data.version,
        name: 'Kora VI',
      })
      expect(renamed.status).toBe(403)
      expect(renamed.data.message).toBe(
        'Only the owner or a group admin can change hotel details. Ask the owner.',
      )
    })

    it("refuses a GM's change of owning company, alone or with the times", async () => {
      const current = await hotel(t, kora.owner, kora.vi.id)
      const company = (
        await t.rpc<{ id: string }>(kora.owner.cookie, 'entities/create', {
          name: `Kora GM Test ${counter} Ltd`,
        })
      ).data
      const base = { id: kora.vi.id, version: current.version, entityId: company.id }
      expect((await update(kora.gm.cookie, base)).status).toBe(403)
      const withTimes = await update(kora.gm.cookie, { ...base, checkInTime: '13:30' })
      expect(withTimes.status).toBe(403)
      expect(await hotel(t, kora.owner, kora.vi.id)).toMatchObject({
        entityId: current.entityId,
        checkInTime: current.checkInTime,
        version: current.version,
      })
    })

    it('answers NOT_FOUND for a hotel outside the caller’s hotels or group', async () => {
      const abuja = await update(kora.gm.cookie, {
        id: kora.abuja.id,
        version: 1,
        checkInTime: '13:00',
      })
      expect(abuja.status).toBe(404)
      const other = await update(kora.owner.cookie, {
        id: kora.otherHotel.id,
        version: 1,
        name: 'Mine',
      })
      expect(other.status).toBe(404)
      expect(
        (await t.rpc(kora.owner.cookie, 'properties/get', { id: kora.otherHotel.id })).status,
      ).toBe(404)
    })
  })

  describe('changing the owning company', () => {
    const newCompany = async (name: string) =>
      (await t.rpc<{ id: string }>(kora.owner.cookie, 'entities/create', { name })).data

    it('moves a hotel that is still setting up at once', async () => {
      const added = await add()
      const company = await newCompany(`Kora Lagos ${counter} Ltd`)
      const moved = await update(kora.owner.cookie, {
        id: added.data.id,
        version: 1,
        entityId: company.id,
      })
      expect(moved.data).toMatchObject({ entityId: company.id, pendingEntity: null })
      expect(await lastEvent(t, kora.owner, 'property', added.data.id)).toMatchObject({
        action: 'property.changed',
        after: expect.objectContaining({ entityId: company.id, liveProperty: false }),
      })
    })

    it('schedules the move of a live hotel for the next business date, with a reason', async () => {
      const added = await add()
      await setLive(t, added.data.id, added.data.businessDate)
      const company = await newCompany(`Kora Abuja ${counter} Ltd`)
      const input = { id: added.data.id, version: 1, entityId: company.id }
      const noReason = await update(kora.owner.cookie, input)
      expect(noReason.data.data).toMatchObject({ code: 'REASON_REQUIRED' })
      const moved = await update(kora.owner.cookie, { ...input, reason: 'Transfer to new company' })
      expect(moved.data.entityId).toBe(kora.company.id)
      expect(moved.data.pendingEntity).toMatchObject({ id: company.id })
      expect(await lastEvent(t, kora.owner, 'property', added.data.id)).toMatchObject({
        action: 'property.entity_change_scheduled',
        reason: 'Transfer to new company',
        after: expect.objectContaining({ liveProperty: true, exception: 'setup_changed' }),
      })
    })

    it('lets night audit apply a scheduled move when it rolls into the effective date', async () => {
      const added = await add()
      await setLive(t, added.data.id, added.data.businessDate)
      const company = await newCompany(`Kora Move ${counter} Ltd`)
      const moved = await update(kora.owner.cookie, {
        id: added.data.id,
        version: 1,
        entityId: company.id,
        reason: 'Transfer',
      })
      const from = moved.data.pendingEntity?.from ?? ''
      const actor = {
        organizationId: kora.orgId,
        userId: kora.owner.userId,
        memberId: kora.owner.memberId,
        userName: 'Adaeze Okafor',
      }
      const apply = (newBusinessDate: string) =>
        t.db.transaction((tx) =>
          applyScheduledEntityChange(tx, actor, { id: added.data.id, newBusinessDate }),
        )
      expect(await apply(added.data.businessDate)).toBe(false)
      expect(await apply(from)).toBe(true)
      expect(await hotel(t, kora.owner, added.data.id)).toMatchObject({
        entityId: company.id,
        pendingEntity: null,
      })
      expect(await lastEvent(t, kora.owner, 'property', added.data.id)).toMatchObject({
        action: 'property.entity_changed',
        after: expect.objectContaining({ entityId: company.id, exception: 'setup_changed' }),
      })
    })

    it('cancels a scheduled move', async () => {
      const added = await add()
      await setLive(t, added.data.id, added.data.businessDate)
      const company = await newCompany(`Kora PH ${counter} Ltd`)
      await update(kora.owner.cookie, {
        id: added.data.id,
        version: 1,
        entityId: company.id,
        reason: 'Sale',
      })
      const input = { id: added.data.id, version: 2 }
      const noReason = await t.rpc<Problem>(
        kora.owner.cookie,
        'properties/cancelEntityChange',
        input,
      )
      expect(noReason.status).toBe(400)
      const cancelled = await t.rpc<Property>(kora.owner.cookie, 'properties/cancelEntityChange', {
        ...input,
        reason: 'Sale fell through',
      })
      expect(cancelled.data).toMatchObject({ pendingEntity: null, entityId: kora.company.id })
      expect(await lastEvent(t, kora.owner, 'property', added.data.id)).toMatchObject({
        action: 'property.entity_change_cancelled',
        reason: 'Sale fell through',
        after: expect.objectContaining({ exception: 'setup_changed' }),
      })
    })

    it("refuses another group's company", async () => {
      const added = await add({ ...ABUJA_ADDRESS })
      const moved = await update(kora.owner.cookie, {
        id: added.data.id,
        version: 1,
        entityId: kora.otherCompany.id,
      })
      expect(moved.status).toBe(400)
    })
  })
})
