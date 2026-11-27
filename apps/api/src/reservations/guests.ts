// Guests, group-wide: search while booking, and find-or-create inside the booking transaction.
// Phone and email are guest data (NDPA 2023): kept in the database, masked in search results and
// audit events, never in logs or Sentry.
import { ORPCError } from '@orpc/server'
import {
  CONTACT_MESSAGE,
  type GuestCorrections,
  type GuestFields,
  type GuestMatch,
  guestName,
  maskEmail,
  maskPhone,
} from '@vento/shared'
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'
import type { AuditEvent } from '../audit/record.ts'
import { guests } from '../db/schema/reservations.ts'
import { containsPattern } from '../team/rules.ts'
import type { Access } from '../tenancy/access.ts'
import { type Reader, requireReservationManage, type Tx } from './context.ts'
import { guestNotFound } from './errors.ts'

export type GuestChoice =
  | { kind: 'existing'; id: string; corrections?: GuestCorrections | undefined }
  | { kind: 'new'; fields: GuestFields }

const matchColumns = {
  id: guests.id,
  title: guests.title,
  firstName: guests.firstName,
  lastName: guests.lastName,
  phone: guests.phone,
  email: guests.email,
  nationality: guests.nationality,
}

// Up to 5 of the group's guests by name, phone or email (3+ characters). Group-wide by design: a
// guest is one profile across the hotels; their stays elsewhere are never shown here.
export async function searchGuests(
  db: Reader,
  access: Access,
  input: { q: string },
): Promise<GuestMatch[]> {
  requireReservationManage(access)
  const text = input.q.trim().toLowerCase()
  const digits = text.replace(/\D/g, '')
  // "0803 456" finds +234803456…: a leading 0 stands for the Nigerian code.
  const phoneDigits = digits.startsWith('0') ? `234${digits.slice(1)}` : digits
  const rows = await db
    .select(matchColumns)
    .from(guests)
    .where(
      and(
        eq(guests.organizationId, access.organizationId),
        isNull(guests.archivedAt),
        or(
          sql`${guests.search} like ${containsPattern(text)}`,
          phoneDigits.length >= 3
            ? sql`regexp_replace(coalesce(${guests.phone}, ''), '\\D', '', 'g') like ${containsPattern(phoneDigits)}`
            : undefined,
        ),
      ),
    )
    .orderBy(desc(sql`similarity(${guests.search}, ${text})`), guests.lastName)
    .limit(5)
  // Contact details leave the server masked only (NDPA 2023).
  return rows.map(({ phone, email, ...row }) => ({
    ...row,
    maskedPhone: phone ? maskPhone(phone) : null,
    maskedEmail: email ? maskEmail(email) : null,
  }))
}

type Context = { reservationId: string; propertyId: string; businessDate: string }

// What audit events keep of a guest's contact details: masked, never in full.
function masked(values: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...values }
  if (typeof out.phone === 'string') out.phone = maskPhone(out.phone)
  if (typeof out.email === 'string') out.email = maskEmail(out.email)
  return out
}

const fieldsOf = (fields: GuestFields) => ({
  title: fields.title ?? null,
  firstName: fields.firstName,
  lastName: fields.lastName,
  phone: fields.phone ?? null,
  email: fields.email ?? null,
  nationality: fields.nationality,
})

// The guest of a booking: a picked guest (locked, details corrected if they differ, audited) or a
// new one (audited). Returns the events for the caller to write with the booking's.
export async function resolveGuest(
  tx: Tx,
  access: Access,
  choice: GuestChoice,
  context: Context,
): Promise<{ id: string; name: string; events: AuditEvent[] }> {
  const at = { propertyId: context.propertyId, businessDate: context.businessDate }
  if (choice.kind === 'new') {
    const values = fieldsOf(choice.fields)
    const [row] = await tx
      .insert(guests)
      .values({ organizationId: access.organizationId, ...values })
      .returning({ id: guests.id })
    if (!row) throw new Error('guest insert returned nothing')
    return {
      id: row.id,
      name: guestName(values),
      events: [
        {
          action: 'guest.created',
          entityType: 'guest',
          entityId: row.id,
          ...at,
          after: {
            fields: Object.keys(values).filter(
              (key) => values[key as keyof typeof values] !== null,
            ),
            ...masked(values),
            reservationId: context.reservationId,
          },
        },
      ],
    }
  }
  const [current] = await tx
    .select(matchColumns)
    .from(guests)
    .where(
      and(
        eq(guests.id, choice.id),
        eq(guests.organizationId, access.organizationId),
        isNull(guests.archivedAt),
      ),
    )
    .for('update')
  if (!current) throw guestNotFound()
  if (!choice.corrections) return { id: current.id, name: guestName(current), events: [] }
  // Only fields typed are corrections; an empty field keeps what the record holds.
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(choice.corrections)) {
    const field = key as keyof typeof current
    if (value !== undefined && value !== current[field]) {
      before[key] = current[field]
      after[key] = value
    }
  }
  if (Object.keys(after).length === 0) {
    return { id: current.id, name: guestName(current), events: [] }
  }
  const next = { ...current, ...after } as typeof current
  if (!next.phone && !next.email) {
    throw new ORPCError('BAD_REQUEST', { message: CONTACT_MESSAGE, data: { field: 'phone' } })
  }
  await tx.update(guests).set(after).where(eq(guests.id, current.id))
  return {
    id: current.id,
    name: guestName(next),
    events: [
      {
        action: 'guest.changed',
        entityType: 'guest',
        entityId: current.id,
        ...at,
        before: masked(before),
        after: {
          fields: Object.keys(after),
          ...masked(after),
          reservationId: context.reservationId,
        },
      },
    ],
  }
}
