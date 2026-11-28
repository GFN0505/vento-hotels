// registrations.get, .reveal and .attachIdDocument (spec: "ID numbers and ID images",
// "Registration step"). Reads are masked; Reveal is the one place a full number leaves the server
// (guest.id_view, a reason, a connection, `Cache-Control: no-store`, guest.id_revealed).
// Correcting a registration after check-in is deferred (polish backlog).
import { ORPCError } from '@orpc/server'
import {
  type attachIdDocumentInputSchema,
  maskIdNumber,
  normalizeIdNumber,
  REVEAL_SECONDS,
  type RegistrationView,
  type revealInputSchema,
  type StayRegistrations,
} from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import type { z } from 'zod'
import { recordAudit } from '../../audit/record.ts'
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
import { registrationsOf, toRegistrationView } from './capture.ts'
import { decryptId } from './crypto.ts'
import { attachDocument, documentNotFound } from './documents.ts'
import { CHECK_IN_ONLY, REVEAL_ONLY } from './messages.ts'

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
      addPhoto: can(access, 'stay.check_in') && !hotel.archived,
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
