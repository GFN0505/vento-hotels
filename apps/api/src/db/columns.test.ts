import { drizzle } from 'drizzle-orm/node-postgres'
import { type getTableConfig, pgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { amount, archivedAt, calendarDate, currency, id, timestamps } from './columns.ts'

// A sample table built from the helpers, to check the generated column definitions.
const sample = pgTable('sample', {
  id: id(),
  total: amount().notNull(),
  currency: currency(),
  arrivalDate: calendarDate().notNull(),
  archivedAt: archivedAt(),
  ...timestamps,
})

// Keyed by the TS property name; Postgres names come from the `casing` option when SQL is built.
const columns = Object.fromEntries(
  Object.entries(sample).filter(
    ([, value]) => typeof value === 'object' && value !== null && 'getSQLType' in value,
  ),
) as Record<string, ReturnType<typeof getTableConfig>['columns'][number]>

describe('column helpers', () => {
  it('names columns in snake_case in the SQL it builds', () => {
    const db = drizzle.mock({ casing: 'snake_case' })
    const query = db.select().from(sample).toSQL().sql
    for (const name of ['"arrival_date"', '"archived_at"', '"created_at"', '"updated_at"']) {
      expect(query).toContain(name)
    }
    expect(query).not.toContain('arrivalDate')
  })

  it('makes a UUID primary key defaulting to uuidv7()', () => {
    expect(columns.id?.getSQLType()).toBe('uuid')
    expect(columns.id?.primary).toBe(true)
    expect(columns.id?.hasDefault).toBe(true)
  })

  it('stores money as numeric(14,2) beside a 3-letter currency defaulting to NGN', () => {
    expect(columns.total?.getSQLType()).toBe('numeric(14, 2)')
    expect(columns.currency?.getSQLType()).toBe('char(3)')
    expect(columns.currency?.default).toBe('NGN')
  })

  it('uses timestamptz for instants and date for calendar dates', () => {
    expect(columns.createdAt?.getSQLType()).toBe('timestamp with time zone')
    expect(columns.updatedAt?.notNull).toBe(true)
    expect(columns.archivedAt?.notNull).toBe(false)
    expect(columns.arrivalDate?.getSQLType()).toBe('date')
  })
})
