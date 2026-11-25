---
name: db-migration
description: Safe workflow for Drizzle schema changes and migrations — generate, review the SQL, apply, property scoping, availability locking, and rules for zero-downtime changes. Use whenever a file in apps/api/src/db/schema changes.
---

# Database migrations

## Workflow
1. Edit the Drizzle schema in `apps/api/src/db/schema/*.ts`.
2. `pnpm db:generate --name <short_description>` (e.g. `add_work_orders`).
3. **Read the generated SQL** in `apps/api/drizzle/`. Check it does only what you intended: no accidental drops or renames turned into drop + add.
4. `pnpm db:migrate` against local Postgres (`pnpm db:up` first).
5. Run the API tests.
6. Commit the schema change and the migration together.

## Rules
- Never edit or delete a migration that's been committed to `main`. Fix forward with a new one.
- Never use `drizzle-kit push` outside throwaway local experiments.
- Every domain table: `id uuid` (v7), `organization_id` NOT NULL + FK + index, `created_at` / `updated_at timestamptz`.
- Operational tables (rooms, reservations, stays, folios, postings, POS checks, housekeeping, work orders, stores, stock) also have `property_id` NOT NULL + FK, with indexes that lead `(organization_id, property_id, …)`. Entity-owned tables (ledger, bank accounts, payroll) have `entity_id` NOT NULL + FK + index. Group-level master data (guests, companies, suppliers) has no `property_id`.
- Dates: `timestamptz` for moments; `date` for stay dates, business dates and due dates. Any row that counts as revenue or a day's activity (postings, POS checks, cashier shifts, power logs) stores `business_date date NOT NULL`, set from the property's current business date, never `now()`.
- Append-only tables (folio postings, payments, ledger entries, stock movements, audit log) get no update or delete paths; corrections are new reversing rows linked to the original.
- Money: `numeric(14,2)` with a `currency char(3)` beside it. Foreign-currency rows also store `fx_rate`, `fx_rate_source` and `fx_rate_date`. Rates and percentages: `numeric(7,4)` (FX rates may need more scale, e.g. `numeric(18,6)`). Tax lines store rate, base and amount at posting time. Never `real` / `double precision`.
- Use Postgres enums for fixed status sets. Adding a value is safe, but removing or renaming one needs a planned migration.
- Add indexes for every foreign key and every column used to filter or sort a list (usually composite with `organization_id`, `property_id` first).
- Enforce invariants in the database too: `CHECK` constraints, partial unique indexes (e.g. one open folio per stay and folio window; one night audit per property per business date: unique on `(property_id, business_date)`), and exclusion constraints where overlap matters (a room can't hold two stays on the same night: `EXCLUDE USING gist (room_id WITH =, daterange(arrival, departure) WITH &&) WHERE status IN ('confirmed','checked_in')`, needs `btree_gist`).
- Idempotency: tables written by offline devices, channel webhooks or Paystack carry a unique `idempotency_key` (or `(channel_id, external_ref)`), so a replay is a no-op.

## Availability and locking
- Inventory lives in one row per `(property_id, room_type_id, date)` with `total`, `out_of_order`, `booked`, `blocked` and `overbooking_limit`, plus `CHECK (booked + blocked + out_of_order <= total + overbooking_limit)`. The check is the last line of defence; the service takes the lock first.
- Every availability change locks those rows with `SELECT … FOR UPDATE` in date order (always ascending, so two bookings can't deadlock), inside the same transaction as the reservation write.
- A migration that adds rooms, a room type or a new date range must backfill inventory rows in the same migration (or a seed step run straight after). Never leave dates without inventory rows: the lock has nothing to hold.
- Don't take long table locks on `room_type_inventory`, `stays` or `folio_postings` in a migration during trading hours: they block check-in and night audit across every property. Batch backfills (e.g. 5,000 rows per statement) and schedule big changes outside the night audit window.

## Changes that stay safe while the app is running
| Change | Safe way |
|---|---|
| Add a column | Nullable or with a default |
| Make a column NOT NULL | Add nullable → backfill → set NOT NULL in a later migration |
| Add `property_id` to an existing table | Add nullable → backfill from the parent (room, outlet, store) → add FK + index → set NOT NULL later |
| Rename a column | Add the new one → write to both → backfill → switch reads → drop the old one later |
| Drop a column | Remove it from the code first, deploy, then drop |
| Big index on a big table | `CREATE INDEX CONCURRENTLY` (in its own migration) |

## Seeds
`apps/api/src/db/seed.ts` must be idempotent (upserts) and is only run by hand or in tests, never on app start. It seeds a group with two properties (one in Lagos, one in Abuja), room types and rooms, inventory rows for the next 365 days, and each property's business date.
