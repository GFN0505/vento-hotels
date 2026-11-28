// registrations.get, .correct, .reveal and .attachIdDocument (spec: "ID numbers and ID images",
// "Registration step"). Reads are masked; Reveal is the one place a full number leaves the server
// (guest.id_view, a reason, a connection, `Cache-Control: no-store`, guest.id_revealed). A
// correction re-checks the rules and records field names and masked numbers only.
import { ORPCError } from '@orpc/server'
import {
  type attachIdDocumentInputSchema,
  type correctRegistrationInputSchema,
  isForeign,
  maskIdNumber,
  normalizeIdNumber,
  REVEAL_SECONDS,
  type RegistrationView,
  type revealInputSchema,
  type StayRegistrations,
} from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import type { z } from 'zod'
import { recordAudit, recordAuditMany } from '../../audit/record.ts'
import type { Database } from '../../db/client.ts'
import { guestRegistrations } from '../../db/schema/front-desk.ts'
import { stays } from '../../db/schema/reservations.ts'
import { stayHotel } from '../../reservations/assign/assign.ts'
import {
  holdBookingHotel,
  loadBookingHotel,
  readBookingHotel,
  requireReservationRead,
} from '../../reservations/context.ts'
import { noPermission } from '../../reservations/errors.ts'
import { type Access, can, requireFeature, scopeToProperties } from '../../tenancy/access.ts'
import {
  checkRegistration,
  givenFields,
  type RegistrationRow,
  registrationsOf,
  toRegistrationView,
} from './capture.ts'
import { currentKeyId, decryptId } from './crypto.ts'
import { attachDocument, documentNotFound } from './documents.ts'
import { CHECK_IN_ONLY, REVEAL_ONLY } from './messages.ts'
import { ruleSetFor } from './rules.ts'

const registrationNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that registration" })

export async function stayRegistrations(
  db: Pick<Database, 'select'>,
  access: Access,
  input: { stayId: string },
): Promise<StayRegistrations> {
  requireReservationRead(access)
  const where = await stayHotel(db, access, input.stayId)
  const hotel = await readBookingHotel(db, access, where.propertyId)
  const rows = await registrationsOf(db, access, [input.stayId])
  return {
    stayId: input.stayId,
    registrations: rows.map((row) => row.view),
    can: {
      correct: can(access, 'stay.check_in') && !hotel.archived,
      viewId: can(access, 'guest.id_view'),
      print: can(access, 'stay.check_in') && !hotel.archived,
    },
  }
}

async function registrationIn(db: Pick<Database, 'select'>, access: Access, id: string) {
  const [row] = await db
    .select()
    .from(guestRegistrations)
    .where(
      and(
        eq(guestRegistrations.organizationId, access.organizationId),
        eq(guestRegistrations.id, id),
        scopeToProperties(access, guestRegistrations.propertyId),
      ),
    )
  if (!row) throw registrationNotFound()
  return row
}

export async function revealNumber(
  db: Database,
  access: Access,
  input: z.output<typeof revealInputSchema>,
  resHeaders?: Headers,
) {
  requireFeature(access, 'front_desk')
  if (!can(access, 'guest.id_view')) throw noPermission(REVEAL_ONLY)
  const row = await registrationIn(db, access, input.registrationId)
  const cipher = input.which === 'id' ? row.idNumberCipher : row.visaNumberCipher
  if (!cipher) throw new ORPCError('NOT_FOUND', { message: 'There is no number to reveal.' })
  const hotel = await readBookingHotel(db, access, row.propertyId)
  const number = decryptId(cipher)
  await recordAudit(db, access, {
    action: 'guest.id_revealed',
    entityType: 'reservation',
    entityId: row.reservationId,
    propertyId: row.propertyId,
    businessDate: hotel.businessDate,
    reason: input.reason,
    after: {
      registrationId: row.id,
      stayId: row.stayId,
      which: input.which,
      masked: input.which === 'id' ? row.idNumberMasked : row.visaNumberMasked,
    },
  })
  // Never kept by a browser, a proxy or the service worker.
  resHeaders?.set('cache-control', 'no-store')
  return { number, idType: input.which === 'id' ? row.idType : null, seconds: REVEAL_SECONDS }
}

// Corrects a registration while the guest is in house (or on the day of check-in).
export async function correctRegistration(
  db: Database,
  access: Access,
  input: z.output<typeof correctRegistrationInputSchema>,
): Promise<RegistrationView> {
  requireFeature(access, 'front_desk')
  if (!can(access, 'stay.check_in')) throw noPermission(CHECK_IN_ONLY)
  const found = await registrationIn(db, access, input.registrationId)
  return db.transaction(async (tx) => {
    const hotel = await holdBookingHotel(tx, access, found.propertyId)
    const [row] = await tx
      .select()
      .from(guestRegistrations)
      .where(eq(guestRegistrations.id, found.id))
      .for('update')
    if (!row) throw registrationNotFound()
    const ruleSet = await ruleSetFor(
      tx,
      { organizationId: access.organizationId, propertyId: hotel.id, stateCode: hotel.stateCode },
      hotel.businessDate,
    )
    const checked = await checkRegistration(
      tx,
      access,
      { ...input.values, lead: row.lead, reuseFrom: input.values.idNumber ? undefined : row.id },
      {
        index: 0,
        ruleSet,
        leadGuestId: row.guestId,
        hasContact: true,
        hasDocument: row.idDocumentId !== null,
      },
    )
    const v = checked.values
    const next: Partial<RegistrationRow> = {
      title: v.title ?? null,
      firstName: v.firstName,
      lastName: v.lastName,
      nationality: v.nationality,
      dateOfBirth: v.dateOfBirth ?? null,
      addressLine: v.addressLine ?? null,
      addressCity: v.addressCity ?? null,
      addressRegion: v.addressRegion ?? null,
      addressCountry: v.addressCountry ?? null,
      purpose: v.purpose ?? null,
      vehiclePlate: v.vehiclePlate ?? null,
      occupation: v.occupation ?? null,
      idType: checked.idType,
      idCountry: v.idCountry ?? null,
      idExpiry: v.idExpiry ?? null,
      visaType: v.visaType ?? null,
      visaTypeText: v.visaTypeText ?? null,
      visaValidUntil: v.visaValidUntil ?? null,
      entryDate: v.entryDate ?? null,
      portOfEntry: v.portOfEntry ?? null,
      portOfEntryText: v.portOfEntryText ?? null,
      arrivingFrom: v.arrivingFrom ?? null,
      nextDestination: v.nextDestination ?? null,
    }
    if (v.idNumber) {
      next.idNumberCipher = checked.id?.cipher ?? null
      next.idNumberMasked = checked.id?.masked ?? null
      next.keyId = currentKeyId()
    }
    if (v.visaNumber && v.visaType !== 'not_required') {
      next.visaNumberCipher = checked.visa?.cipher ?? null
      next.visaNumberMasked = checked.visa?.masked ?? null
      next.keyId = currentKeyId()
    }
    const changed = (Object.keys(next) as (keyof RegistrationRow)[]).filter(
      (key) =>
        key !== 'keyId' &&
        key !== 'idNumberCipher' &&
        key !== 'visaNumberCipher' &&
        next[key] !== row[key],
    )
    if (changed.length === 0) return toRegistrationView(row, null)
    const [updated] = await tx
      .update(guestRegistrations)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(guestRegistrations.id, row.id))
      .returning()
    if (!updated) throw registrationNotFound()
    const masked = (r: RegistrationRow) => ({
      idNumberMasked: r.idNumberMasked,
      visaNumberMasked: r.visaNumberMasked,
      nationality: r.nationality,
    })
    await recordAuditMany(tx, access, [
      {
        action: 'guest.registration_corrected',
        entityType: 'reservation',
        entityId: row.reservationId,
        propertyId: row.propertyId,
        businessDate: hotel.businessDate,
        before: { ...masked(row), fields: changed },
        after: {
          ...masked(updated),
          registrationId: row.id,
          stayId: row.stayId,
          fields: changed,
          given: givenFields(v),
          foreign: isForeign(updated.nationality),
        },
      },
    ])
    return toRegistrationView(updated, null)
  })
}

// "Add ID photo": a check-in that went ahead without one (a GM skipped it) gets it later.
export async function attachIdDocumentLater(
  db: Database,
  access: Access,
  input: z.output<typeof attachIdDocumentInputSchema>,
): Promise<RegistrationView> {
  requireFeature(access, 'front_desk')
  if (!can(access, 'stay.check_in')) throw noPermission(CHECK_IN_ONLY)
  const found = await registrationIn(db, access, input.registrationId)
  if (!found.lead || !found.guestId) throw documentNotFound()
  await loadBookingHotel(db, access, found.propertyId)
  return db.transaction(async (tx) => {
    const hotel = await holdBookingHotel(tx, access, found.propertyId)
    const [row] = await tx
      .select()
      .from(guestRegistrations)
      .where(eq(guestRegistrations.id, found.id))
      .for('update')
    if (!row?.guestId) throw registrationNotFound()
    const attached = await attachDocument(tx, access, {
      documentId: input.documentId,
      guestId: row.guestId,
      reuse: false,
      idType: row.idType,
      idExpiry: row.idExpiry,
      businessDate: hotel.businessDate,
    })
    const [updated] = await tx
      .update(guestRegistrations)
      .set({ idDocumentId: attached.row.id, updatedAt: new Date() })
      .where(eq(guestRegistrations.id, row.id))
      .returning()
    if (!updated) throw registrationNotFound()
    const [stay] = await tx.select({ number: stays.id }).from(stays).where(eq(stays.id, row.stayId))
    await recordAudit(tx, access, {
      action: 'guest.id_document_captured',
      entityType: 'reservation',
      entityId: row.reservationId,
      propertyId: row.propertyId,
      businessDate: hotel.businessDate,
      after: {
        documentId: attached.row.id,
        registrationId: row.id,
        stayId: stay?.number ?? row.stayId,
        contentType: attached.row.contentType,
        byteSize: attached.row.byteSize,
        source: attached.row.source,
        reused: false,
        later: true,
      },
    })
    return toRegistrationView(updated, {
      id: attached.row.id,
      contentType: attached.row.contentType,
      createdAt: attached.row.createdAt,
    })
  })
}

export { maskIdNumber, normalizeIdNumber }
