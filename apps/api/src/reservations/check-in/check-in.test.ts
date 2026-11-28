// Check-in, registration, ID photos, Undo, reversal, in-house moves and the walk-in, against the test
// database through the real HTTP flow (spec: stage-1-front-desk-check-in.md, "Tests"). Kora Victoria
// Island, business date 25 Nov 2026 (moved forward where a test needs a fresh night): Deluxe King
// (6 rooms) and Standard Queen (4) on Bed & breakfast.
import type {
  ChartRoom,
  CheckInPrepare,
  FrontDeskList,
  ReservationDetail,
  StayRegistrations,
  TapeChart,
} from '@vento/shared'
import { addDays, newId } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditFor, type KoraApprovals, koraApprovals } from '../../approvals/testing.ts'
import {
  guestIdDocuments,
  guestRegistrations,
  stayRoomSegments,
} from '../../db/schema/front-desk.ts'
import { auditEvents } from '../../db/schema/governance.ts'
import { stays } from '../../db/schema/reservations.ts'
import { rooms } from '../../db/schema/rooms.ts'
import { setHotel } from '../../finance/testing.ts'
import { purgePendingIdDocuments } from '../../guests/registration/documents.ts'
import { assign, roomsOf, setStatus } from '../../tape-chart/testing.ts'
import { createTestApp } from '../../test/harness.ts'
import { bookStay, detailOf, fieldsOf, modify, rpc } from '../change/testing.ts'
import { DAY, quote } from '../testing.ts'
import { british, checkIn, idPhoto, NIN, nigerian, PASSPORT, upload } from './testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('check-in', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let k: KoraApprovals
  let dlk: ChartRoom[]
  let stq: ChartRoom[]
  let businessDate = DAY

  // Moves the hotel to a fresh business date so each test has free rooms tonight.
  const freshDay = async () => {
    businessDate = addDays(businessDate, 5)
    await setHotel(t, k.vi.id, { businessDate })
    return businessDate
  }
  const arrival = (nights = 2, typeId?: string) =>
    bookStay(t, k.frontDesk.cookie, k.vi.id, {
      roomTypeId: typeId ?? k.types.dlk.id,
      ratePlanId: k.bb.id,
      arrival: businessDate,
      departure: addDays(businessDate, nights),
    })
  const room = (list: ChartRoom[], i: number) => {
    const found = list[i]
    if (!found) throw new Error(`no room ${i}`)
    return found
  }
  const stayRow = async (id: string) => (await t.db.select().from(stays).where(eq(stays.id, id)))[0]

  beforeAll(async () => {
    k = await koraApprovals(t)
    dlk = await roomsOf(t, k.owner.cookie, k.vi.id, k.types.dlk.id)
    stq = await roomsOf(t, k.owner.cookie, k.vi.id, k.types.stq.id)
  })

  describe('an assigned arrival', () => {
    it('checks in with the registration, the ID photo and the card, numbers encrypted and masked', async () => {
      await freshDay()
      const b = await arrival()
      const photo = await upload(t, k.frontDesk.cookie, k.vi.id)
      expect(photo.status).toBe(200)
      const prepared = await rpc<CheckInPrepare>(t, k.frontDesk.cookie, 'checkIn/prepare', {
        stayId: b.stay.id,
      })
      expect(prepared.status).toBe(200)
      expect(prepared.data.blocked).toBeNull()
      expect(prepared.data.rules.lead.required).toEqual(
        expect.arrayContaining(['address', 'id_number', 'id_document']),
      )
      expect(prepared.data.rooms.length).toBeGreaterThan(0)
      const done = await checkIn(t, k.frontDesk.cookie, b.stay, room(dlk, 0).id, {
        businessDate,
        idDocument: { kind: 'uploaded', documentId: photo.data.id },
        printCard: true,
      })
      expect(done.status).toBe(200)
      expect(done.data.room.number).toBe(room(dlk, 0).number)
      expect(done.data.registrations[0]?.idNumberMasked).toBe('A0•••••67')
      expect(done.data.registrations[0]?.idDocument?.id).toBe(photo.data.id)
      expect(done.data.cardUrl).toContain('/api/files/registration-card?t=')
      expect(JSON.stringify(done.data)).not.toContain(PASSPORT)

      const row = await stayRow(b.stay.id)
      expect(row?.status).toBe('checked_in')
      expect(row?.checkedInByName).toBe('Chiamaka Eze')
      const [registration] = await t.db
        .select()
        .from(guestRegistrations)
        .where(eq(guestRegistrations.stayId, b.stay.id))
      expect(registration?.idNumberCipher).toMatch(/^v1\./)
      expect(registration?.idNumberCipher).not.toContain(PASSPORT)
      expect(registration?.cardNumber).toMatch(/^RC-VI-\d{2}-\d{6}$/)
      const [document] = await t.db
        .select()
        .from(guestIdDocuments)
        .where(eq(guestIdDocuments.id, photo.data.id))
      expect(document?.status).toBe('attached')
      expect(document?.storageKey).toBe(`guest-ids/${k.orgId}/${k.vi.id}/${photo.data.id}.png`)
      expect(t.privateStorage.files.has(document?.storageKey ?? '')).toBe(true)
      expect(t.storage.files.has(document?.storageKey ?? '')).toBe(false)

      for (const action of [
        'stay.checked_in',
        'guest.registration_captured',
        'guest.id_document_captured',
        'registration_card.printed',
        'stay.room_assigned',
      ]) {
        expect((await auditFor(t, k.orgId, action, b.id)).length).toBe(1)
      }
      const events = await t.db
        .select({ before: auditEvents.before, after: auditEvents.after })
        .from(auditEvents)
        .where(eq(auditEvents.entityId, b.id))
      expect(JSON.stringify(events)).not.toContain(PASSPORT)

      // The card: a real PDF behind the 5-minute link, refused once tampered with.
      const pdf = await t.call(done.data.cardUrl ?? '', {})
      expect(pdf.status).toBe(200)
      expect(pdf.headers.get('content-type')).toBe('application/pdf')
      expect(pdf.headers.get('cache-control')).toBe('no-store')
      expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5))).toBe('%PDF-')
      const forged = await t.call(`${done.data.cardUrl ?? ''}x`, {})
      expect(forged.status).toBe(404)

      // The detail and the lists show it.
      const detail = await detailOf(t, k.frontDesk.cookie, b.id)
      expect(detail.status).toBe('checked_in')
      expect(detail.stays[0]?.checkIn?.byName).toBe('Chiamaka Eze')
      expect(detail.actions.checkIn).toBe(false)
      const list = await rpc<FrontDeskList>(t, k.frontDesk.cookie, 'frontDesk/list', {
        propertyId: k.vi.id,
        tab: 'in_house',
      })
      expect(list.data.items.map((row) => row.stayId)).toContain(b.stay.id)
    })

    it('refuses a stay not arriving today, a missing field, a missing photo, and a skip by the front desk', async () => {
      await freshDay()
      const later = await bookStay(t, k.frontDesk.cookie, k.vi.id, {
        roomTypeId: k.types.dlk.id,
        ratePlanId: k.bb.id,
        arrival: addDays(businessDate, 1),
        departure: addDays(businessDate, 2),
      })
      const early = await checkIn(t, k.frontDesk.cookie, later.stay, room(dlk, 1).id, {
        businessDate,
      })
      expect(early.data.data?.code).toBe('NOT_ARRIVING_TODAY')
      const b = await arrival()
      const noAddress = await checkIn(t, k.owner.cookie, b.stay, room(dlk, 1).id, {
        businessDate,
        registrations: [british({ addressLine: undefined })],
      })
      expect(noAddress.status).toBe(400)
      expect(noAddress.data.data?.code).toBe('REGISTRATION_INCOMPLETE')
      expect(noAddress.data.message).toBe("Enter the guest's home address")
      const noNext = await checkIn(t, k.owner.cookie, b.stay, room(dlk, 1).id, {
        businessDate,
        registrations: [british({ nextDestination: undefined })],
      })
      expect(noNext.data.message).toBe('Enter the next destination')
      const noPhoto = await checkIn(t, k.frontDesk.cookie, b.stay, room(dlk, 1).id, {
        businessDate,
        idDocument: { kind: 'none' },
      })
      expect(noPhoto.data.data?.code).toBe('ID_DOCUMENT_REQUIRED')
      const skipped = await checkIn(t, k.frontDesk.cookie, b.stay, room(dlk, 1).id, {
        businessDate,
      })
      expect(skipped.status).toBe(403)
      expect(skipped.data.message).toBe(
        'Only a GM or the owner can skip the ID photo. Ask your GM.',
      )
      const badNin = await checkIn(t, k.gm.cookie, b.stay, room(dlk, 1).id, {
        businessDate,
        registrations: [nigerian({ firstName: 'Sarah', idNumber: '1234' })],
      })
      expect(badNin.data.message).toBe('A NIN has 11 digits.')
      // A GM can skip it with a reason; the stay then shows "ID photo to add".
      const gm = await checkIn(t, k.gm.cookie, b.stay, room(dlk, 1).id, { businessDate })
      expect(gm.status).toBe(200)
      const list = await rpc<FrontDeskList>(t, k.frontDesk.cookie, 'frontDesk/list', {
        propertyId: k.vi.id,
        tab: 'in_house',
      })
      expect(list.data.items.find((row) => row.stayId === b.stay.id)?.idPhotoMissing).toBe(true)
      expect((await auditFor(t, k.orgId, 'guest.id_document_skipped', b.id)).length).toBe(1)
      // …and the photo can be added later.
      const photo = await upload(t, k.frontDesk.cookie, k.vi.id)
      const registrationId = gm.data.registrations[0]?.id
      const added = await rpc(t, k.frontDesk.cookie, 'registrations/attachIdDocument', {
        registrationId,
        documentId: photo.data.id,
      })
      expect(added.status).toBe(200)
      const after = await rpc<FrontDeskList>(t, k.frontDesk.cookie, 'frontDesk/list', {
        propertyId: k.vi.id,
        tab: 'in_house',
      })
      expect(after.data.items.find((row) => row.stayId === b.stay.id)?.idPhotoMissing).toBe(false)
    })

    it('lets an ECOWAS citizen in without a visa and warns nothing is missing for a Nigerian', async () => {
      await freshDay()
      const b = await arrival()
      const ghanaian = await checkIn(t, k.gm.cookie, b.stay, room(dlk, 2).id, {
        businessDate,
        registrations: [
          british({
            firstName: 'Sarah',
            nationality: 'GH',
            visaType: 'not_required',
            visaNumber: undefined,
            visaValidUntil: undefined,
            idCountry: 'GH',
          }),
        ],
      })
      expect(ghanaian.status).toBe(200)
      expect(ghanaian.data.registrations[0]?.visaNumberMasked).toBeNull()
      const detail = await detailOf(t, k.gm.cookie, b.id)
      expect(detail.guest.nationality).toBe('GH')
      expect((await auditFor(t, k.orgId, 'guest.changed')).length).toBeGreaterThan(0)
    })

    it('is idempotent: the same key returns the first result, another says who checked in', async () => {
      await freshDay()
      const b = await arrival()
      const key = newId()
      const first = await checkIn(t, k.gm.cookie, b.stay, room(dlk, 3).id, {
        businessDate,
        idempotencyKey: key,
      })
      const again = await checkIn(t, k.gm.cookie, b.stay, room(dlk, 3).id, {
        businessDate,
        idempotencyKey: key,
      })
      expect(again.status).toBe(200)
      expect(again.data.checkedInAt).toBe(first.data.checkedInAt)
      const other = await checkIn(t, k.owner.cookie, b.stay, room(dlk, 3).id, { businessDate })
      expect(other.data.data?.code).toBe('ALREADY_CHECKED_IN')
      expect(other.data.message).toMatch(/^Tunde Bello checked in Sarah Collins at \d\d:\d\d\.$/)
      expect((await auditFor(t, k.orgId, 'stay.checked_in', b.id)).length).toBe(1)
    })

    it('allows a dirty room with the warning, shows Waiting for room, and refuses a taken room', async () => {
      await freshDay()
      const b = await arrival()
      await setStatus(t, k.frontDesk.cookie, k.vi.id, room(dlk, 4).id, 'dirty')
      const done = await checkIn(t, k.gm.cookie, b.stay, room(dlk, 4).id, { businessDate })
      expect(done.data.roomNotReady).toBe(true)
      const list = await rpc<FrontDeskList>(t, k.frontDesk.cookie, 'frontDesk/list', {
        propertyId: k.vi.id,
        tab: 'in_house',
      })
      expect(list.data.items.find((row) => row.stayId === b.stay.id)?.waitingForRoom).toBe(true)
      const second = await arrival()
      const taken = await checkIn(t, k.gm.cookie, second.stay, room(dlk, 4).id, { businessDate })
      expect(taken.data.data?.code).toBe('ROOM_TAKEN')
      const otherType = await checkIn(t, k.gm.cookie, second.stay, room(stq, 0).id, {
        businessDate,
      })
      expect(otherType.data.data?.code).toBe('ROOM_WRONG_TYPE')
    })

    it('refuses an offline check-in from a closed business date', async () => {
      await freshDay()
      const b = await arrival()
      const stale = await checkIn(t, k.frontDesk.cookie, b.stay, room(dlk, 5).id, {
        businessDate: addDays(businessDate, -1),
        source: 'offline',
      })
      expect(stale.data.data?.code).toBe('BUSINESS_DATE_MOVED')
    })
  })

  describe('Undo and reversal', () => {
    it('undoes your own within 8 seconds; a GM reverses another’s, never their own, the room set dirty', async () => {
      await freshDay()
      const b = await arrival()
      const done = await checkIn(t, k.gm.cookie, b.stay, room(dlk, 0).id, { businessDate })
      const notMine = await rpc(t, k.owner.cookie, 'checkIn/undo', {
        idempotencyKey: newId(),
        stayId: b.stay.id,
        version: done.data.version,
      })
      expect((notMine.data as { data?: { code?: string } }).data?.code).toBe('UNDO_EXPIRED')
      const undone = await rpc<{ version: number }>(t, k.gm.cookie, 'checkIn/undo', {
        idempotencyKey: newId(),
        stayId: b.stay.id,
        version: done.data.version,
      })
      expect(undone.status).toBe(200)
      expect((await stayRow(b.stay.id))?.status).toBe('confirmed')
      expect((await stayRow(b.stay.id))?.roomId).toBe(room(dlk, 0).id)

      const again = await checkIn(
        t,
        k.gm.cookie,
        { id: b.stay.id, version: undone.data.version },
        room(dlk, 0).id,
        {
          businessDate,
        },
      )
      expect(again.status).toBe(200)
      const own = await rpc(t, k.gm.cookie, 'checkIn/reverse', {
        idempotencyKey: newId(),
        stayId: b.stay.id,
        version: again.data.version,
        reason: 'wrong_booking',
      })
      expect(own.status).toBe(403)
      expect(own.data.message).toBe(
        'You checked Sarah Collins in. Ask another manager to reverse it.',
      )
      const desk = await rpc(t, k.frontDesk.cookie, 'checkIn/reverse', {
        idempotencyKey: newId(),
        stayId: b.stay.id,
        version: again.data.version,
        reason: 'wrong_booking',
      })
      expect(desk.data.message).toBe('Only a GM or the owner can reverse a check-in. Ask your GM.')
      const reversed = await rpc(t, k.owner.cookie, 'checkIn/reverse', {
        idempotencyKey: newId(),
        stayId: b.stay.id,
        version: again.data.version,
        reason: 'wrong_booking',
      })
      expect(reversed.status).toBe(200)
      expect((await stayRow(b.stay.id))?.status).toBe('confirmed')
      const [roomRow] = await t.db
        .select()
        .from(rooms)
        .where(eq(rooms.id, room(dlk, 0).id))
      expect(roomRow?.housekeepingStatus).toBe('dirty')
      const [event] = await auditFor(t, k.orgId, 'stay.check_in_reversed', b.id)
      expect(event?.reason).toBe('Wrong booking')
      expect(event?.after).toMatchObject({
        exception: 'check_in_reversed',
        checkedInByName: 'Tunde Bello',
      })
    })
  })

  describe('registrations', () => {
    it('reuses a returning guest’s number and photo, reveals only to a GM with a reason, and views the photo', async () => {
      await freshDay()
      const first = await arrival(1)
      const photo = await upload(t, k.frontDesk.cookie, k.vi.id)
      const done = await checkIn(t, k.frontDesk.cookie, first.stay, room(dlk, 1).id, {
        businessDate,
        registrations: [nigerian()],
        idDocument: { kind: 'uploaded', documentId: photo.data.id },
      })
      expect(done.data.registrations[0]?.idNumberMasked).toBe('••••••8901')
      // The same guest again: no number typed, the earlier one copied on the server.
      const second = await bookStay(
        t,
        k.frontDesk.cookie,
        k.vi.id,
        {
          roomTypeId: k.types.dlk.id,
          ratePlanId: k.bb.id,
          arrival: businessDate,
          departure: addDays(businessDate, 1),
        },
        { guest: { kind: 'existing', id: first.detail.guest.id } },
      )
      const prepared = await rpc<CheckInPrepare>(t, k.frontDesk.cookie, 'checkIn/prepare', {
        stayId: second.stay.id,
      })
      expect(prepared.data.previous?.idNumberMasked).toBe('••••••8901')
      expect(prepared.data.previous?.reusableDocument?.id).toBe(photo.data.id)
      expect(JSON.stringify(prepared.data)).not.toContain(NIN)
      // Only the reused fields: never the earlier stay's card number, dates or who registered it.
      for (const key of ['cardNumber', 'businessDate', 'byName', 'arrival', 'createdAt']) {
        expect(prepared.data.previous).not.toHaveProperty(key)
      }
      const previousId = prepared.data.previous?.id
      const reused = await checkIn(t, k.frontDesk.cookie, second.stay, room(dlk, 2).id, {
        businessDate,
        registrations: [nigerian({ idNumber: undefined, reuseFrom: previousId })],
        idDocument: { kind: 'reuse', documentId: photo.data.id },
      })
      expect(reused.status).toBe(200)
      const rows = await t.db
        .select()
        .from(guestRegistrations)
        .where(eq(guestRegistrations.stayId, second.stay.id))
      expect(rows[0]?.reusedFromId).toBe(previousId)
      expect(rows[0]?.idDocumentId).toBe(photo.data.id)

      const registrationId = reused.data.registrations[0]?.id
      const desk = await rpc(t, k.frontDesk.cookie, 'registrations/reveal', {
        registrationId,
        which: 'id',
        reason: 'Immigration officer at the desk',
      })
      expect(desk.status).toBe(403)
      const noReason = await rpc(t, k.gm.cookie, 'registrations/reveal', {
        registrationId,
        which: 'id',
        reason: '',
      })
      expect(noReason.status).toBe(400)
      const revealed = await rpc<{ number: string; seconds: number }>(
        t,
        k.gm.cookie,
        'registrations/reveal',
        { registrationId, which: 'id', reason: 'Immigration officer at the desk' },
      )
      expect(revealed.data).toMatchObject({ number: NIN, seconds: 30 })
      const [event] = await auditFor(t, k.orgId, 'guest.id_revealed', second.id)
      expect(event?.reason).toBe('Immigration officer at the desk')
      expect(JSON.stringify(event)).not.toContain(NIN)

      const view = await rpc<{ url: string; expiresInSeconds: number }>(
        t,
        k.gm.cookie,
        'registrations/viewIdDocument',
        { registrationId, reason: 'Checking the photo' },
      )
      expect(view.data.expiresInSeconds).toBe(60)
      expect(view.data.url).toContain('guest-ids/')
      const deskView = await rpc(t, k.frontDesk.cookie, 'registrations/viewIdDocument', {
        registrationId,
        reason: 'Checking the photo',
      })
      expect(deskView.status).toBe(403)
      expect((await auditFor(t, k.orgId, 'guest.id_document_viewed', second.id)).length).toBe(1)

      const listed = await rpc<StayRegistrations>(t, k.frontDesk.cookie, 'registrations/get', {
        stayId: second.stay.id,
      })
      expect(listed.data.can.viewId).toBe(false)
      expect(JSON.stringify(listed.data)).not.toContain(NIN)
    })

    it('checks an ID file from its bytes: no text pretending to be a photo, nothing over 5 MB, no metadata', async () => {
      const text = await upload(
        t,
        k.frontDesk.cookie,
        k.vi.id,
        Buffer.from('hello, this is not a picture').toString('base64'),
        'image/jpeg',
      )
      expect(text.data.data?.code).toBe('ID_DOCUMENT_INVALID')
      const big = await upload(
        t,
        k.frontDesk.cookie,
        k.vi.id,
        Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(5 * 1024 * 1024)]).toString(
          'base64',
        ),
        'application/pdf',
      )
      expect([400, 413]).toContain(big.status)
      const exif = [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0, 1, 2, 3])
      const seg = (marker: number, body: number[]) => [0xff, marker, 0, body.length + 2, ...body]
      const jpeg = Buffer.from([
        0xff,
        0xd8,
        ...seg(0xe1, exif),
        ...seg(0xc0, [8, 0, 2, 0, 2, 1, 1, 0x11, 0]),
        ...seg(0xda, [1, 1, 0, 0, 0x3f, 0]),
        0x12,
        0xff,
        0xd9,
      ])
      const clean = await upload(
        t,
        k.frontDesk.cookie,
        k.vi.id,
        jpeg.toString('base64'),
        'image/jpeg',
      )
      expect(clean.status).toBe(200)
      const [document] = await t.db
        .select()
        .from(guestIdDocuments)
        .where(eq(guestIdDocuments.id, clean.data.id))
      const stored = t.privateStorage.files.get(document?.storageKey ?? '')
      expect(stored).toBeDefined()
      expect(Buffer.from(stored ?? []).toString('latin1')).not.toContain('Exif')
      expect(idPhoto().length).toBeGreaterThan(10)
    })

    it('purges an upload no check-in named within a day: archived, its file gone, never attached after', async () => {
      await freshDay()
      const data = idPhoto()
      const left = await upload(t, k.frontDesk.cookie, k.vi.id, data)
      expect(left.status).toBe(200)
      const dayAgo = new Date(Date.now() - 25 * 60 * 60 * 1000)
      await t.db
        .update(guestIdDocuments)
        .set({ createdAt: dayAgo })
        .where(eq(guestIdDocuments.id, left.data.id))
      const [before] = await t.db
        .select()
        .from(guestIdDocuments)
        .where(eq(guestIdDocuments.id, left.data.id))
      expect(await purgePendingIdDocuments(t.db, t.privateStorage)).toBeGreaterThanOrEqual(1)
      const [after] = await t.db
        .select()
        .from(guestIdDocuments)
        .where(eq(guestIdDocuments.id, left.data.id))
      expect(after).toMatchObject({ status: 'archived' })
      expect(after?.purgedAt).not.toBeNull()
      expect(after?.archivedAt).not.toBeNull()
      expect(t.privateStorage.files.has(before?.storageKey ?? '')).toBe(false)
      // The same upload sent again can't bring it back, and a check-in can't name it.
      const resent = await rpc(t, k.frontDesk.cookie, 'registrations/uploadIdDocument', {
        documentId: left.data.id,
        propertyId: k.vi.id,
        contentType: 'image/png',
        data,
      })
      expect(resent.data.data?.code).toBe('ID_DOCUMENT_NOT_FOUND')
      const b = await arrival(1)
      const named = await checkIn(t, k.frontDesk.cookie, b.stay, room(dlk, 0).id, {
        businessDate,
        registrations: [nigerian()],
        idDocument: { kind: 'uploaded', documentId: left.data.id },
      })
      expect(named.data.data?.code).toBe('ID_DOCUMENT_NOT_FOUND')
    })
  })

  describe('in house', () => {
    it('moves from the business date on: earlier nights stay in the old room, which turns dirty', async () => {
      await freshDay()
      const b = await arrival(3)
      const done = await checkIn(t, k.gm.cookie, b.stay, room(dlk, 3).id, { businessDate })
      const next = addDays(businessDate, 1)
      await setHotel(t, k.vi.id, { businessDate: next })
      const noReason = await assign(
        t,
        k.frontDesk.cookie,
        { id: b.stay.id, version: done.data.version },
        room(dlk, 4).id,
      )
      expect(noReason.data.data?.code).toBe('MOVE_REASON_REQUIRED')
      const moved = await assign(
        t,
        k.frontDesk.cookie,
        { id: b.stay.id, version: done.data.version },
        room(dlk, 4).id,
        { reason: 'maintenance' },
      )
      expect(moved.status).toBe(200)
      const row = await stayRow(b.stay.id)
      expect(row?.roomId).toBe(room(dlk, 4).id)
      expect(row?.roomFrom).toBe(next)
      const segments = await t.db
        .select()
        .from(stayRoomSegments)
        .where(eq(stayRoomSegments.stayId, b.stay.id))
      expect(segments).toMatchObject([
        { roomId: room(dlk, 3).id, fromDate: businessDate, toDate: next },
      ])
      const [old] = await t.db
        .select()
        .from(rooms)
        .where(eq(rooms.id, room(dlk, 3).id))
      expect(old?.housekeepingStatus).toBe('dirty')
      // The old room is free from the move on (another guest can have it tonight).
      const tonight = await bookStay(t, k.frontDesk.cookie, k.vi.id, {
        roomTypeId: k.types.dlk.id,
        ratePlanId: k.bb.id,
        arrival: next,
        departure: addDays(next, 1),
      })
      const into = await assign(t, k.frontDesk.cookie, tonight.stay, room(dlk, 3).id)
      expect(into.status).toBe(200)
      // The chart draws both parts.
      const chart = await rpc<TapeChart>(t, k.owner.cookie, 'tapeChart/get', {
        propertyId: k.vi.id,
        from: businessDate,
        days: 7,
      })
      const bar = chart.data.stays.find((stay) => stay.id === b.stay.id)
      expect(bar).toMatchObject({ roomFrom: next, status: 'checked_in', movable: true })
      expect(bar?.segments).toEqual([{ roomId: room(dlk, 3).id, from: businessDate, to: next }])
      const detail = await detailOf(t, k.owner.cookie, b.id)
      expect(detail.stays[0]?.earlierRooms).toEqual([
        { number: room(dlk, 3).number, from: businessDate, to: next },
      ])
      // An in-house guest can't be cancelled; the departure can change.
      const cancel = await rpc(t, k.frontDesk.cookie, 'reservations/endQuote', {
        reservationId: b.id,
        mode: 'cancel',
      })
      expect(cancel.data).toMatchObject({ blocked: expect.stringContaining('in house') })
      const fresh = await detailOf(t, k.frontDesk.cookie, b.id)
      const first = fresh.stays[0]
      if (!first) throw new Error('no stay')
      const extended = await modify(
        t,
        k.frontDesk.cookie,
        fieldsOf(
          { id: b.id, number: b.number, stay: first, detail: fresh },
          {
            departure: addDays(businessDate, 4),
          },
        ),
      )
      expect(extended.status).toBe(200)
      const nights = await t.db.select().from(stays).where(eq(stays.id, b.stay.id))
      expect(nights[0]?.departure).toBe(addDays(businessDate, 4))
      expect(nights[0]?.roomFrom).toBe(next)
    })
  })

  describe('walk-in', () => {
    it('books and checks in in one transaction, once per key', async () => {
      await freshDay()
      const departure = addDays(businessDate, 2)
      const quoted = await quote(t, k.frontDesk.cookie, k.vi.id, {
        roomTypeId: k.types.stq.id,
        ratePlanId: k.bar.id,
        arrival: businessDate,
        departure,
        adults: 2,
      })
      expect(quoted.status).toBe(200)
      const booking = {
        idempotencyKey: newId(),
        propertyId: k.vi.id,
        guest: {
          kind: 'new',
          fields: {
            firstName: 'Emeka',
            lastName: 'Okoro',
            phone: '+2348034127790',
            nationality: 'NG',
          },
        },
        source: 'direct',
        stays: [
          {
            roomTypeId: k.types.stq.id,
            ratePlanId: k.bar.id,
            arrival: businessDate,
            departure,
            adults: 2,
            children: 0,
            quoteHash: quoted.data.quoteHash,
            roomId: room(stq, 1).id,
          },
        ],
      }
      const input = {
        booking,
        registrations: [nigerian({ firstName: 'Emeka', lastName: 'Okoro' })],
        idDocument: {
          kind: 'uploaded',
          documentId: (await upload(t, k.frontDesk.cookie, k.vi.id)).data.id,
        },
        printCard: false,
        durationSeconds: 52,
      }
      const done = await rpc<{
        reservationId: string
        stayId: string
        version: number
        room: { number: string }
      }>(t, k.frontDesk.cookie, 'walkIn/checkIn', input)
      expect(done.status).toBe(200)
      expect(done.data.room.number).toBe(room(stq, 1).number)
      const again = await rpc<{ reservationId: string }>(
        t,
        k.frontDesk.cookie,
        'walkIn/checkIn',
        input,
      )
      expect(again.data.reservationId).toBe(done.data.reservationId)
      const detail = await detailOf(t, k.frontDesk.cookie, done.data.reservationId)
      expect(detail).toMatchObject({ source: 'walk_in', status: 'checked_in' })
      const [event] = await auditFor(t, k.orgId, 'stay.checked_in', done.data.reservationId)
      expect(event?.after).toMatchObject({ walkIn: true, durationSeconds: 52 })
      // Not tonight: refused, nothing saved.
      const later = await rpc(t, k.frontDesk.cookie, 'walkIn/checkIn', {
        ...input,
        booking: {
          ...booking,
          idempotencyKey: newId(),
          stays: [
            { ...booking.stays[0], arrival: addDays(businessDate, 1), roomId: room(stq, 2).id },
          ],
        },
      })
      expect(later.status).toBeGreaterThanOrEqual(400)
      // Undo takes the booking with it, in the same transaction: nothing left open.
      const undone = await rpc<{ bookingCancelled?: boolean }>(
        t,
        k.frontDesk.cookie,
        'checkIn/undo',
        {
          idempotencyKey: newId(),
          stayId: done.data.stayId,
          version: done.data.version,
        },
      )
      expect(undone.status).toBe(200)
      expect(undone.data.bookingCancelled).toBe(true)
      const after = await detailOf(t, k.frontDesk.cookie, done.data.reservationId)
      expect(after).toMatchObject({ source: 'walk_in', status: 'cancelled' })
      const [cancelled] = await auditFor(
        t,
        k.orgId,
        'stay.check_in_undone',
        done.data.reservationId,
      )
      expect(cancelled?.after).toMatchObject({ walkIn: true })
    })
  })

  describe('the lists', () => {
    it('count arrivals, departures and in house with the Tonight figures', async () => {
      await freshDay()
      const a = await arrival(2)
      const unassigned = await arrival(2)
      await assign(t, k.frontDesk.cookie, a.stay, room(dlk, 5).id)
      const list = await rpc<FrontDeskList>(t, k.frontDesk.cookie, 'frontDesk/list', {
        propertyId: k.vi.id,
        tab: 'arrivals',
      })
      expect(list.status).toBe(200)
      const ids = list.data.items.map((row) => row.stayId)
      expect(ids).toEqual(expect.arrayContaining([a.stay.id, unassigned.stay.id]))
      expect(list.data.counts.unassigned).toBeGreaterThanOrEqual(1)
      const t1 = list.data.tonight
      expect(t1.arriving + t1.occupied + t1.vacant + t1.outOfOrder).toBe(21)
      const pills = await rpc<FrontDeskList>(t, k.frontDesk.cookie, 'frontDesk/list', {
        propertyId: k.vi.id,
        tab: 'arrivals',
        pill: 'unassigned',
      })
      expect(pills.data.items.every((row) => row.room === null)).toBe(true)
      const search = await rpc<FrontDeskList>(t, k.frontDesk.cookie, 'frontDesk/list', {
        propertyId: k.vi.id,
        tab: 'arrivals',
        search: a.number,
      })
      expect(search.data.items.map((row) => row.stayId)).toEqual([a.stay.id])
      const hotels = await rpc<{ id: string; arrivals: number }[]>(
        t,
        k.owner.cookie,
        'frontDesk/hotels',
        {},
      )
      expect(hotels.data.find((h) => h.id === k.vi.id)?.arrivals).toBeGreaterThanOrEqual(2)
      // Sade (revenue) reads them, can't check in.
      const sade = await rpc<FrontDeskList>(t, k.sade.cookie, 'frontDesk/list', {
        propertyId: k.vi.id,
        tab: 'arrivals',
      })
      expect(sade.data.can.checkIn).toBe(false)
      expect(sade.data.items[0]?.checkInBlocked).toBe(
        'Only front desk, GMs and the owner can check guests in. Ask your GM.',
      )
      const outsider = await rpc(t, k.other.cookie, 'frontDesk/list', {
        propertyId: k.vi.id,
        tab: 'arrivals',
      })
      expect(outsider.status).toBeGreaterThanOrEqual(400)
      const detail = await rpc<ReservationDetail>(t, k.other.cookie, 'reservations/get', {
        id: a.id,
      })
      expect(detail.status).toBe(404)
      const fromOutside = await rpc(t, k.other.cookie, 'checkIn/prepare', { stayId: a.stay.id })
      expect(fromOutside.status).toBe(404)
    })
  })
})
