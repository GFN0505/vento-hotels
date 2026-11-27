// The Reservations list: a group page (one hotel, or every hotel the member sees), views Upcoming,
// Booked today and All, search by name, phone, email or number, and filters. Server-paginated.
import {
  type ListReservationsInput,
  type listReservationsSchema,
  type Page,
  pageOffset,
  type ReservationRow,
  toPage,
} from '@vento/shared'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  lte,
  ne,
  type SQL,
  sql,
} from 'drizzle-orm'
import type { z } from 'zod'
import type { Database } from '../db/client.ts'
import { guests, reservations, stays } from '../db/schema/reservations.ts'
import { roomTypes } from '../db/schema/rooms.ts'
import { properties } from '../db/schema/tenancy.ts'
import { containsPattern } from '../team/rules.ts'
import { type Access, requireListableHotel, scopeToProperties } from '../tenancy/access.ts'
import { requireReservationRead } from './context.ts'

type Input = z.output<typeof listReservationsSchema>

// Digits, spaces, + and - only: a phone number or the end of a reservation number.
const NUMERIC = /^[\d\s+\-()]+$/

function searchFilter(q: string | undefined): SQL | undefined {
  const text = q?.trim().toLowerCase() ?? ''
  if (text.length < 2) return undefined
  if (NUMERIC.test(text)) {
    const digits = text.replace(/\D/g, '')
    const phone = digits.startsWith('0') ? `234${digits.slice(1)}` : digits
    return sql`(${reservations.number} like ${`%${digits}`} or (${phone.length >= 3} and regexp_replace(coalesce(${guests.phone}, ''), '\\D', '', 'g') like ${containsPattern(phone)}))`
  }
  if (text.length < 3) return undefined
  return sql`(${guests.search} like ${containsPattern(text)} or lower(${reservations.number}) like ${containsPattern(text)})`
}

// The first stay's room type (one room per reservation in this brick's screens).
const roomTypeName = sql<string>`(select rt.name from ${stays} s join ${roomTypes} rt on rt.id = s.room_type_id where s.reservation_id = ${reservations}.id order by s.arrival limit 1)`

export async function listReservations(
  db: Database,
  access: Access,
  input: Input | ListReservationsInput,
): Promise<Page<ReservationRow>> {
  requireReservationRead(access)
  const query = input as Input
  if (query.propertyId) await requireListableHotel(db, access, query.propertyId)
  const where = and(
    eq(reservations.organizationId, access.organizationId),
    scopeToProperties(access, reservations.propertyId),
    query.propertyId ? eq(reservations.propertyId, query.propertyId) : undefined,
    // Each hotel's own business date.
    query.view === 'upcoming'
      ? and(
          gt(reservations.departure, properties.businessDate),
          ne(reservations.status, 'cancelled'),
        )
      : query.view === 'booked_today'
        ? eq(reservations.bookedOnBusinessDate, properties.businessDate)
        : undefined,
    query.status ? eq(reservations.status, query.status) : undefined,
    query.source ? eq(reservations.source, query.source) : undefined,
    query.arrivalFrom ? gte(reservations.arrival, query.arrivalFrom) : undefined,
    query.arrivalTo ? lte(reservations.arrival, query.arrivalTo) : undefined,
    query.depositDue
      ? and(
          isNotNull(reservations.depositDue),
          inArray(reservations.status, ['confirmed', 'tentative']),
        )
      : undefined,
    query.roomTypeId
      ? sql`exists (select 1 from ${stays} s where s.reservation_id = ${reservations}.id and s.room_type_id = ${query.roomTypeId})`
      : undefined,
    searchFilter(query.q),
  )
  const order =
    query.view === 'booked_today'
      ? [desc(reservations.bookedAt)]
      : [
          asc(reservations.arrival),
          asc(guests.lastName),
          asc(guests.firstName),
          asc(reservations.id),
        ]
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: reservations.id,
        number: reservations.number,
        propertyId: reservations.propertyId,
        propertyName: properties.name,
        firstName: guests.firstName,
        lastName: guests.lastName,
        nationality: guests.nationality,
        arrival: reservations.arrival,
        departure: reservations.departure,
        roomTypeName,
        source: reservations.source,
        status: reservations.status,
        depositDue: reservations.depositDue,
        depositDueAt: reservations.depositDueAt,
        total: reservations.quotedTotal,
        bookedAt: reservations.bookedAt,
      })
      .from(reservations)
      .innerJoin(guests, eq(guests.id, reservations.guestId))
      .innerJoin(properties, eq(properties.id, reservations.propertyId))
      .where(where)
      .orderBy(...order)
      .limit(query.pageSize)
      .offset(pageOffset(query)),
    db
      .select({ value: count() })
      .from(reservations)
      .innerJoin(guests, eq(guests.id, reservations.guestId))
      .innerJoin(properties, eq(properties.id, reservations.propertyId))
      .where(where),
  ])
  const items = rows.map((row) => ({
    id: row.id,
    number: row.number,
    propertyId: row.propertyId,
    propertyName: row.propertyName,
    guestName: `${row.firstName} ${row.lastName}`,
    foreign: row.nationality !== 'NG',
    arrival: row.arrival,
    departure: row.departure,
    roomTypeName: row.roomTypeName ?? '',
    source: row.source,
    status: row.status,
    depositDue:
      row.depositDue && row.depositDueAt
        ? { amount: row.depositDue, dueAt: row.depositDueAt.toISOString() }
        : null,
    total: row.total,
    bookedAt: row.bookedAt.toISOString(),
  }))
  return toPage(items, total?.value ?? 0, query)
}
