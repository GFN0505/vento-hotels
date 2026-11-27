// The demo group's approvals (spec: stage-1-approvals.md, "Demo seed"). All history (closed),
// because a pending one would expire 30 minutes after seeding. Dates relative to D, the business
// date:
// - Kora Victoria Island: Chiamaka at 15% (Deluxe King, Bed & breakfast, Long stay) approved by
//   Tunde's PIN on FD-VI-01 on D−2 and used; Ibrahim at 18% asked in Tunde's inbox on D−1 and
//   declined ("Max 12% this week"); Chiamaka at 14% that expired unanswered on D−1;
// - Kora Ikeja GRA: Sade at 30% (over her 25%) approved by Adaeze in the inbox and used, so the
//   owner's All hotels view shows two hotels.
// Bookings go through the booking service with the approval, as the desk would.
import {
  APPROVAL_MINUTES,
  addDays,
  type CreateReservationInput,
  createReservationSchema,
  instantAt,
  newId,
} from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import { evaluateStayDiscount, STAY_DISCOUNT } from '../approvals/kinds/stay-discount.ts'
import { type Actor, recordAudit, recordSystemAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { approvals } from '../db/schema/approvals.ts'
import { ratePlans } from '../db/schema/rates.ts'
import { roomTypes } from '../db/schema/rooms.ts'
import { bookInTx } from '../reservations/book.ts'
import { discountLimitOf } from '../reservations/pricing.ts'
import type { Access } from '../tenancy/access.ts'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export type ApprovalSeedContext = {
  organizationId: string
  businessDate: string
  hotels: { vi: string; ikeja: string }
  deviceId: string
  deviceName: string
  access: { chiamaka: Access; ibrahim: Access; sade: Access }
  approvers: { tunde: Actor; adaeze: Actor }
  limits: { tunde: string; adaeze: string | null }
}

const MINUTE = 60 * 1000

async function stayAt(tx: Tx, propertyId: string, code: string | null, plan: string) {
  const [type] = await tx
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(and(eq(roomTypes.propertyId, propertyId), code ? eq(roomTypes.code, code) : undefined))
    .orderBy(roomTypes.sortOrder)
    .limit(1)
  const [ratePlan] = await tx
    .select({ id: ratePlans.id })
    .from(ratePlans)
    .where(and(eq(ratePlans.propertyId, propertyId), eq(ratePlans.code, plan)))
  if (!type || !ratePlan) throw new Error(`The demo needs ${code ?? 'a room type'} on ${plan}`)
  return { roomTypeId: type.id, ratePlanId: ratePlan.id }
}

type Ask = {
  access: Access
  propertyId: string
  stay: { roomTypeId: string; ratePlanId: string }
  arrival: string
  nights: number
  percent: string
  reason: 'long_stay' | 'repeat_guest' | 'corporate_rate_match'
  note?: string
  guest: { title: string; firstName: string; lastName: string; phone: string; nationality: string }
  askedOn: string
  at: string
}

function bookingOf(ask: Ask): CreateReservationInput {
  return {
    idempotencyKey: newId(),
    propertyId: ask.propertyId,
    guest: { kind: 'new', fields: ask.guest },
    source: 'phone',
    stays: [
      {
        ...ask.stay,
        arrival: ask.arrival,
        departure: addDays(ask.arrival, ask.nights),
        adults: 1,
        children: 0,
        quoteHash: 'seed',
        discount: {
          kind: 'percent',
          value: ask.percent,
          reason: ask.reason,
          ...(ask.note ? { note: ask.note } : {}),
        },
      },
    ],
  }
}

export async function seedApprovals(tx: Tx, context: ApprovalSeedContext): Promise<number> {
  const D = context.businessDate
  const { vi, ikeja } = context.hotels
  const dlk = await stayAt(tx, vi, 'DLK', 'BB')
  const ikejaStay = await stayAt(tx, ikeja, null, 'BB')

  // One approval row and its events; answered as given, used by a booking when approved.
  async function record(
    ask: Ask,
    outcome:
      | { status: 'approved'; method: 'pin_here' | 'inbox'; approver: 'tunde' | 'adaeze' }
      | { status: 'declined'; approver: 'tunde'; comment: string }
      | { status: 'expired'; approver: 'tunde' },
  ) {
    const askedAt = instantAt(ask.askedOn, ask.at, 'Africa/Lagos')
    const answeredAt = new Date(askedAt.getTime() + 3 * MINUTE)
    const booking = bookingOf(ask)
    const parsed = createReservationSchema.parse(booking)
    const pinHere = outcome.status === 'approved' && outcome.method === 'pin_here'
    const evaluated = await evaluateStayDiscount(
      tx,
      ask.access,
      { kind: STAY_DISCOUNT.kind, booking: parsed, stayIndex: 0 },
      { now: askedAt, deviceName: ask.propertyId === vi ? context.deviceName : null },
    )
    const approver = context.approvers[outcome.approver]
    const approverLimit = context.limits[outcome.approver]
    const id = newId()
    const requester: Actor = { ...ask.access, deviceId: pinHere ? context.deviceId : null }
    const answered = outcome.status !== 'expired'
    await tx.insert(approvals).values({
      id,
      organizationId: context.organizationId,
      propertyId: ask.propertyId,
      kind: STAY_DISCOUNT.kind,
      permission: STAY_DISCOUNT.permission,
      value: evaluated.value,
      valueKind: STAY_DISCOUNT.valueKind,
      status: outcome.status,
      method:
        outcome.status === 'approved'
          ? outcome.method
          : outcome.status === 'declined'
            ? 'inbox'
            : null,
      requesterMemberId: ask.access.memberId,
      requesterName: ask.access.userName,
      requesterLimit: discountLimitOf(ask.access),
      approverMemberId: approver.memberId,
      approverName: approver.userName,
      approverLimit: outcome.status === 'approved' ? approverLimit : null,
      bindingHash: evaluated.bindingHash,
      subject: evaluated.subject,
      actionKey: booking.idempotencyKey,
      comment: outcome.status === 'declined' ? outcome.comment : null,
      businessDate: ask.askedOn,
      requestedAt: askedAt,
      answeredAt: answered ? answeredAt : null,
      expiresAt: new Date((answered ? answeredAt : askedAt).getTime() + APPROVAL_MINUTES * MINUTE),
      requestDeviceId: ask.propertyId === vi ? context.deviceId : null,
      approverDeviceId: pinHere ? context.deviceId : null,
      idempotencyKey: newId(),
    })
    const at = {
      entityType: 'approval',
      entityId: id,
      propertyId: ask.propertyId,
      businessDate: ask.askedOn,
    }
    const common = {
      approvalId: id,
      kind: STAY_DISCOUNT.kind,
      value: evaluated.value,
      requesterName: ask.access.userName,
      approverName: approver.userName,
      subject: evaluated.subject,
    }
    if (!pinHere) {
      await recordAudit(tx, ask.access, { action: 'approval.requested', ...at, after: common })
    }
    if (outcome.status === 'approved') {
      await recordAudit(tx, pinHere ? requester : approver, {
        action: 'approval.granted',
        ...at,
        approverMemberId: approver.memberId,
        after: { ...common, method: outcome.method, approverLimit },
      })
      // Booked a minute after the yes, on the same business date, with the approval.
      await bookInTx(
        tx,
        ask.access,
        createReservationSchema.parse({
          ...booking,
          stays: booking.stays.map((stay) => ({ ...stay, approvalId: id })),
        }),
        {
          bookedAt: new Date(answeredAt.getTime() + MINUTE),
          bookedOnBusinessDate: ask.askedOn,
          trustQuote: true,
        },
      )
    } else if (outcome.status === 'declined') {
      await recordAudit(tx, approver, {
        action: 'approval.declined',
        ...at,
        reason: outcome.comment,
        approverMemberId: approver.memberId,
        after: common,
      })
    } else {
      await recordSystemAudit(
        tx,
        context.organizationId,
        { action: 'approval.expired', ...at, after: { ...common, was: 'pending' } },
        'Approvals',
      )
    }
  }

  await record(
    {
      access: context.access.chiamaka,
      propertyId: vi,
      stay: dlk,
      arrival: addDays(D, 4),
      nights: 3,
      percent: '15',
      reason: 'long_stay',
      note: 'Staying through the conference',
      guest: {
        title: 'Mr',
        firstName: 'Kola',
        lastName: 'Bankole',
        phone: '+2348031234567',
        nationality: 'NG',
      },
      askedOn: addDays(D, -2),
      at: '10:36',
    },
    { status: 'approved', method: 'pin_here', approver: 'tunde' },
  )
  await record(
    {
      access: context.access.ibrahim,
      propertyId: vi,
      stay: dlk,
      arrival: addDays(D, 6),
      nights: 2,
      percent: '18',
      reason: 'repeat_guest',
      guest: {
        title: 'Ms',
        firstName: 'Ifeoma',
        lastName: 'Chukwu',
        phone: '+2348039876543',
        nationality: 'NG',
      },
      askedOn: addDays(D, -1),
      at: '15:12',
    },
    { status: 'declined', approver: 'tunde', comment: 'Max 12% this week' },
  )
  await record(
    {
      access: context.access.chiamaka,
      propertyId: vi,
      stay: dlk,
      arrival: addDays(D, 8),
      nights: 2,
      percent: '14',
      reason: 'corporate_rate_match',
      guest: {
        title: 'Mr',
        firstName: 'Segun',
        lastName: 'Afolabi',
        phone: '+2348025551234',
        nationality: 'NG',
      },
      askedOn: addDays(D, -1),
      at: '18:40',
    },
    { status: 'expired', approver: 'tunde' },
  )
  await record(
    {
      access: context.access.sade,
      propertyId: ikeja,
      stay: ikejaStay,
      arrival: addDays(D, 5),
      nights: 2,
      percent: '30',
      reason: 'corporate_rate_match',
      note: 'Matching their usual Ikeja rate',
      guest: {
        title: 'Mrs',
        firstName: 'Bisi',
        lastName: 'Lawal',
        phone: '+2348057778888',
        nationality: 'NG',
      },
      askedOn: addDays(D, -1),
      at: '11:05',
    },
    { status: 'approved', method: 'inbox', approver: 'adaeze' },
  )
  return 4
}
