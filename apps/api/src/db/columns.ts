// Column helpers every table uses, so the CLAUDE.md data rules are applied the same way everywhere.
// Column names are snake_case in Postgres (the Drizzle `casing` option) and camelCase in TS.
import { sql } from 'drizzle-orm'
import { char, date, numeric, timestamp, uuid } from 'drizzle-orm/pg-core'

// UUID v7 primary key. Postgres 18 generates it by default; offline devices may send their own
// (newId() from @vento/shared), which is why this is a default and not forced.
export const id = () => uuid().primaryKey().default(sql`uuidv7()`)

const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' })

// Every table has createdAt and updatedAt (non-negotiable 10).
export const timestamps = {
  createdAt: timestamptz().notNull().defaultNow(),
  updatedAt: timestamptz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

// Soft delete for master data (properties, rooms, rate plans, menu items, guests).
export const archivedAt = () => timestamptz()

// Money: numeric(14,2), read and written as a string (non-negotiable 5). Pair it with `currency()`.
export const amount = () => numeric({ precision: 14, scale: 2, mode: 'string' })

// ISO 4217 code beside every amount, NGN by default.
export const currency = () => char({ length: 3 }).notNull().default('NGN')

// Calendar dates (stay, business and due dates): `date`, kept as a 'YYYY-MM-DD' string.
export const calendarDate = () => date({ mode: 'string' })
