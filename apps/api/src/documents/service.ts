// documents.registrationCard: a print or reprint of the stay's card (spec: "Registration card").
// Every print is an audit event (original, then reprint with its copy number); the answer is a
// 5-minute link the browser opens in its print dialog. The PDF itself is rendered when the link is
// opened (route in app.ts), from the record, never stored.
import { ORPCError } from '@orpc/server'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { guestRegistrations } from '../db/schema/front-desk.ts'
import { auditEvents } from '../db/schema/governance.ts'
import { stays } from '../db/schema/reservations.ts'
import { stayHotel } from '../reservations/assign/assign.ts'
import { type CheckInDeps, cardUrlFor, requireCheckIn } from '../reservations/check-in/check-in.ts'
import { loadBookingHotel } from '../reservations/context.ts'
import type { Access } from '../tenancy/access.ts'
import { readCardToken } from './card-link.ts'
import { renderRegistrationCard } from './registration-card.ts'
import { registrationCardData } from './registration-card-data.ts'

export async function printRegistrationCard(
  deps: CheckInDeps,
  access: Access,
  input: { stayId: string },
): Promise<{ url: string; copy: number }> {
  requireCheckIn(access)
  const where = await stayHotel(deps.db, access, input.stayId)
  const hotel = await loadBookingHotel(deps.db, access, where.propertyId)
  const [lead] = await deps.db
    .select({ cardNumber: guestRegistrations.cardNumber })
    .from(guestRegistrations)
    .where(
      and(
        eq(guestRegistrations.organizationId, access.organizationId),
        eq(guestRegistrations.stayId, input.stayId),
        eq(guestRegistrations.lead, true),
      ),
    )
  if (!lead) {
    throw new ORPCError('NOT_FOUND', {
      message: 'This guest has no registration yet. Check them in first.',
    })
  }
  const [printed] = await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, access.organizationId),
        eq(auditEvents.action, 'registration_card.printed'),
        eq(auditEvents.entityId, where.reservationId),
        sql`${auditEvents.after}->>'stayId' = ${input.stayId}`,
      ),
    )
  const copy = (printed?.n ?? 0) + 1
  await deps.db.transaction(async (tx) => {
    await tx
      .update(stays)
      .set({ cardPrintedAt: new Date() })
      .where(and(eq(stays.id, input.stayId), isNull(stays.cardPrintedAt)))
    await recordAudit(tx, access, {
      action: 'registration_card.printed',
      entityType: 'reservation',
      entityId: where.reservationId,
      propertyId: hotel.id,
      businessDate: hotel.businessDate,
      after: {
        stayId: input.stayId,
        cardNumber: lead.cardNumber,
        copy: copy === 1 ? 'original' : 'reprint',
        number: copy,
      },
    })
  })
  const url = await cardUrlFor(
    deps,
    deps.db,
    access,
    { propertyId: hotel.id, id: input.stayId },
    copy,
  )
  if (!url)
    throw new ORPCError('PRECONDITION_FAILED', { message: 'Printing is off on this server.' })
  return { url, copy }
}

// GET /api/files/registration-card?t=…: the PDF for a valid, unexpired link.
export async function registrationCardResponse(
  db: Database,
  secret: string | undefined,
  token: string | undefined,
): Promise<Response> {
  const claims = secret && token ? readCardToken(secret, token) : null
  if (!claims) {
    return new Response('This link has expired. Print the card again from Vento.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
  const data = await registrationCardData(
    db,
    { organizationId: claims.organizationId, propertyId: claims.propertyId, stayId: claims.stayId },
    { copy: claims.copy, byName: claims.byName, deviceName: claims.deviceName, at: new Date() },
  )
  if (!data)
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  const pdf = await renderRegistrationCard(data)
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="registration-card-${data.cardNumber}.pdf"`,
      'cache-control': 'no-store',
    },
  })
}
