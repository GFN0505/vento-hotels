// Cash drawers and cashier shifts (spec: docs/specs/stage-1-cashier-shifts.md). A shift is one
// person on one drawer at a hotel: opened with a float counted by note, counted blind, closed with
// the float kept and the rest to the safe. Partial unique indexes keep one shift not closed per
// drawer and per person; the migration adds a trigger that only lets the status move forward and
// one that makes count lines append-only (written once, at submit). Member ids carry no foreign
// keys and names are snapshots (decision 0018).
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { amount, archivedAt, calendarDate, id, timestamps } from '../columns.ts'
import { organizations } from './auth.ts'
import { fxRateSourceEnum, posTerminals } from './finance.ts'
import { devices, properties } from './tenancy.ts'

export const cashierShiftStatusEnum = pgEnum('cashier_shift_status', ['open', 'counted', 'closed'])
export const cashCountLineKindEnum = pgEnum('cash_count_line_kind', [
  'cash',
  'pos_terminal',
  'bank_transfer',
])

const organizationId = () =>
  uuid()
    .notNull()
    .references(() => organizations.id, { onDelete: 'restrict' })
const inProperty = (name: string, t: { organizationId: AnyPgColumn; propertyId: AnyPgColumn }) =>
  foreignKey({
    name,
    columns: [t.organizationId, t.propertyId],
    foreignColumns: [properties.organizationId, properties.id],
  }).onDelete('restrict')
const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' })
const ngn = () => char({ length: 3 }).notNull().default('NGN')

export const cashDrawers = pgTable(
  'cash_drawers',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: uuid().notNull(),
    name: text().notNull(),
    archivedAt: archivedAt(),
    version: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId, t.propertyId),
    inProperty('cash_drawers_property_fk', t),
    unique('cash_drawers_property_id_id_unique').on(t.propertyId, t.id),
    uniqueIndex('cash_drawers_name_unique')
      .on(t.propertyId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    check('cash_drawers_name_length', sql`char_length(${t.name}) between 1 and 30`),
  ],
)

// The POS terminals at a drawer. A terminal may sit at more than one drawer of its hotel.
export const cashDrawerTerminals = pgTable(
  'cash_drawer_terminals',
  {
    organizationId: organizationId(),
    propertyId: uuid().notNull(),
    drawerId: uuid().notNull(),
    posTerminalId: uuid().notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.drawerId, t.posTerminalId] }),
    index().on(t.organizationId, t.propertyId),
    index().on(t.posTerminalId),
    inProperty('cash_drawer_terminals_property_fk', t),
    foreignKey({
      name: 'cash_drawer_terminals_drawer_fk',
      columns: [t.propertyId, t.drawerId],
      foreignColumns: [cashDrawers.propertyId, cashDrawers.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'cash_drawer_terminals_terminal_fk',
      columns: [t.propertyId, t.posTerminalId],
      foreignColumns: [posTerminals.propertyId, posTerminals.id],
    }).onDelete('cascade'),
  ],
)

export const cashierShifts = pgTable(
  'cashier_shifts',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: uuid().notNull(),
    drawerId: uuid().notNull(),
    // Per hotel per business date, from 1, in opening order.
    number: integer().notNull(),
    businessDate: calendarDate().notNull(),
    memberId: uuid().notNull(),
    memberName: text().notNull(),
    deviceId: uuid().references(() => devices.id, { onDelete: 'set null' }),
    deviceName: text(),
    status: cashierShiftStatusEnum().notNull().default('open'),
    openedAt: timestamptz().notNull(),
    openingFloat: amount().notNull(),
    // Notes by value ("1000": 30, …) and `coins`: the count as typed.
    openingNotes: jsonb().notNull(),
    handoverFromShiftId: uuid(),
    handoverFromName: text(),
    // What the previous shift kept (0.00 for a first shift) and counted − that.
    handoverExpected: amount().notNull().default('0.00'),
    handoverDifference: amount().notNull().default('0.00'),
    handoverReason: text(),
    handoverApprovalId: uuid(),
    // The drawer's terminals at opening: their count lines, whatever happens to the drawer later.
    terminalIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    countedAt: timestamptz(),
    countedBusinessDate: calendarDate(),
    cashCounted: amount(),
    totalDifference: amount(),
    closedAt: timestamptz(),
    closedBusinessDate: calendarDate(),
    closeReason: text(),
    closeApprovalId: uuid(),
    floatKept: amount(),
    dropNgn: amount(),
    dropBagNumber: text(),
    currency: ngn(),
    openIdempotencyKey: uuid().notNull(),
    countIdempotencyKey: uuid(),
    closeIdempotencyKey: uuid(),
    version: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId, t.propertyId, t.businessDate),
    index().on(t.organizationId, t.memberId),
    index().on(t.drawerId, t.openedAt),
    index().on(t.deviceId),
    inProperty('cashier_shifts_property_fk', t),
    unique('cashier_shifts_property_id_id_unique').on(t.propertyId, t.id),
    foreignKey({
      name: 'cashier_shifts_drawer_fk',
      columns: [t.propertyId, t.drawerId],
      foreignColumns: [cashDrawers.propertyId, cashDrawers.id],
    }).onDelete('restrict'),
    unique('cashier_shifts_number_unique').on(t.propertyId, t.businessDate, t.number),
    uniqueIndex('cashier_shifts_one_per_drawer').on(t.drawerId).where(sql`${t.status} <> 'closed'`),
    uniqueIndex('cashier_shifts_one_per_member')
      .on(t.organizationId, t.memberId)
      .where(sql`${t.status} <> 'closed'`),
    unique('cashier_shifts_open_key_unique').on(t.organizationId, t.openIdempotencyKey),
    unique('cashier_shifts_count_key_unique').on(t.organizationId, t.countIdempotencyKey),
    unique('cashier_shifts_close_key_unique').on(t.organizationId, t.closeIdempotencyKey),
    check('cashier_shifts_number_positive', sql`${t.number} >= 1`),
    check('cashier_shifts_float_non_negative', sql`${t.openingFloat} >= 0`),
    check(
      'cashier_shifts_handover_reason',
      sql`${t.handoverDifference} = 0 or ${t.handoverReason} is not null`,
    ),
    check(
      'cashier_shifts_counted_complete',
      sql`${t.status} = 'open' or (${t.countedAt} is not null and ${t.countedBusinessDate} is not null and ${t.cashCounted} is not null and ${t.totalDifference} is not null)`,
    ),
    check(
      'cashier_shifts_closed_complete',
      sql`${t.status} <> 'closed' or (${t.closedAt} is not null and ${t.closedBusinessDate} is not null and ${t.floatKept} is not null and ${t.dropNgn} is not null)`,
    ),
    check(
      'cashier_shifts_close_reason',
      sql`${t.status} <> 'closed' or ${t.totalDifference} = 0 or ${t.closeReason} is not null`,
    ),
    check(
      'cashier_shifts_float_kept',
      sql`${t.floatKept} is null or (${t.floatKept} >= 0 and ${t.floatKept} <= ${t.cashCounted})`,
    ),
    check(
      'cashier_shifts_bag_number',
      sql`${t.dropBagNumber} is null or ${t.dropBagNumber} ~ '^[A-Z0-9-]{1,20}$'`,
    ),
    check('cashier_shifts_currency', sql`${t.currency} = 'NGN'`),
  ],
)

// One row per line counted at submit: cash per currency (naira by note), each POS terminal, bank
// transfers. Written once; the migration's trigger refuses every update and delete. What goes to the
// safe is on the shift (naira) and is all of each foreign line. A foreign line counted and expected
// at 0 needs no rate.
export const cashierShiftCountLines = pgTable(
  'cashier_shift_count_lines',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: uuid().notNull(),
    shiftId: uuid().notNull(),
    kind: cashCountLineKindEnum().notNull(),
    currency: char({ length: 3 }).notNull(),
    posTerminalId: uuid(),
    notes: jsonb(),
    counted: amount().notNull(),
    expected: amount().notNull(),
    difference: amount().notNull(),
    fxRate: numeric({ precision: 14, scale: 4, mode: 'string' }),
    fxSource: fxRateSourceEnum(),
    fxRateDate: calendarDate(),
    countedNgn: amount().notNull(),
    expectedNgn: amount().notNull(),
    differenceNgn: amount().notNull(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId, t.propertyId),
    index().on(t.posTerminalId),
    inProperty('cashier_shift_count_lines_property_fk', t),
    foreignKey({
      name: 'cashier_shift_count_lines_shift_fk',
      columns: [t.propertyId, t.shiftId],
      foreignColumns: [cashierShifts.propertyId, cashierShifts.id],
    }).onDelete('restrict'),
    uniqueIndex('cashier_shift_count_lines_one_per_line').on(
      t.shiftId,
      t.kind,
      t.currency,
      sql`coalesce(${t.posTerminalId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    check('cashier_shift_count_lines_currency', sql`${t.currency} in ('NGN','USD','GBP','EUR')`),
    check(
      'cashier_shift_count_lines_terminal',
      sql`(${t.kind} = 'pos_terminal') = (${t.posTerminalId} is not null)`,
    ),
    check(
      'cashier_shift_count_lines_fx',
      sql`(${t.currency} <> 'NGN' or ${t.fxRate} is null) and (${t.fxRate} is null) = (${t.fxRateDate} is null) and (${t.fxRate} is null) = (${t.fxSource} is null)`,
    ),
    check('cashier_shift_count_lines_counted', sql`${t.counted} >= 0`),
  ],
)
