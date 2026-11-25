// Runs against the real test database (vento_hotels_test), migrated by the test setup.
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { createDatabase } from './client.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('the test database', () => {
  const { db, close } = createDatabase(url ?? '', { max: 2 })
  afterAll(() => close())

  it('returns numeric money as exact strings, never floats', async () => {
    const result = await db.execute<{ total: string }>(
      sql`select ('0.10'::numeric(14,2) + '0.20'::numeric(14,2))::numeric(14,2) as total`,
    )
    expect(result.rows[0]?.total).toBe('0.30')
  })

  it('generates UUID v7 ids by default', async () => {
    const result = await db.execute<{ id: string }>(sql`select uuidv7()::text as id`)
    expect(result.rows[0]?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/)
  })

  it('refuses UPDATE and DELETE on a table with the append-only guard', async () => {
    // Each statement runs in its own transaction that is rolled back, so nothing is left behind.
    await db
      .transaction(async (tx) => {
        await tx.execute(
          sql`create temporary table guarded (id uuid primary key default uuidv7(), note text) on commit drop`,
        )
        await tx.execute(
          sql`create trigger guarded_append_only before update or delete on guarded
              for each row execute function vento_forbid_update_delete()`,
        )
        await tx.execute(sql`insert into guarded (note) values ('posted')`)

        await expect(tx.execute(sql`savepoint s1`)).resolves.toBeDefined()
        await expect(tx.execute(sql`update guarded set note = 'changed'`)).rejects.toMatchObject({
          cause: { code: '23001' },
        })
        await tx.execute(sql`rollback to savepoint s1`)
        await expect(tx.execute(sql`delete from guarded`)).rejects.toMatchObject({
          cause: { code: '23001' },
        })
        tx.rollback()
      })
      .catch((error: unknown) => {
        // tx.rollback() throws to abort the transaction; anything else is a real failure.
        if (!(error instanceof Error && error.message === 'Rollback')) throw error
      })
  })
})
