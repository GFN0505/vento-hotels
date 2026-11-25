---
name: testing-patterns
description: How tests are written in this repo — Vitest service tests against real Postgres, factories and seed usage, the cross-organization isolation and cross-property scoping tests, audit event assertions, permission limit and approval tests, leakage control tests (discrepancy check, blind count), the no-overbooking concurrency test, business date, offline sync, component tests, Playwright e2e conventions. Use when writing or fixing tests.
---

# Testing patterns

## Layers
| Layer | Tool | Where | Covers |
|---|---|---|---|
| Schemas | Vitest | `packages/shared/**/*.test.ts` | Validation rules and messages |
| Services | Vitest + real Postgres | `apps/api/src/modules/**/*.test.ts` | Business rules, isolation, property scoping, permissions, locking |
| Components | Vitest + Testing Library | `apps/web/src/**/*.test.tsx` | Forms, tricky UI logic |
| User flows | Playwright | `apps/web/e2e/*.spec.ts` | Critical journeys end to end, including offline |

Don't mock the database. Service tests run against the test database, and each test is wrapped in a transaction that's rolled back. Concurrency tests are the exception: they need real separate connections, so they commit and clean up their own organization afterwards.

## Factories — `apps/api/src/test/factories.ts`
```ts
const org = await createOrganization()
const property = await createProperty(org, { businessDate: '2026-11-25' })
const user = await createMember(org, { role: 'front_desk', properties: [property] })
const roomType = await createRoomType(property, { rooms: 2 })   // also creates inventory rows
const guest = await createGuest(org)
const ctx = contextFor(user, org)
```
Factories take overrides and fill realistic defaults. Never depend on rows created by another test, or on `pnpm db:seed` data: the seed (the demo group) is for local development, demos, and the Playwright smoke and walkthrough journeys only, and CI runs it against a fresh database to prove it still loads. `createDevice(property, { shared: true })` and `createMember(org, { role, pin })` cover PIN sign-in on shared devices; `setPermissionLimits(org, { 'stay.discount': { front_desk: '10' } })` overrides the matrix seed defaults. Never use the wall clock: set the property's business date explicitly, and freeze time (`vi.setSystemTime`) when a rule depends on the hour (late check-out, auto-release of unguaranteed bookings).

## Required tests for every resource
```ts
it('creates a reservation when the room type is available', …)
it('rejects a departure on or before the arrival date', …)
it('rejects a booking when the room type is full for any night', …)
it('denies a housekeeping attendant from creating a reservation', …)
it('returns NOT_FOUND for a reservation in another organization', async () => {
  const other = await createOrganization()
  const foreign = await createReservation(await createProperty(other))
  await expect(get(ctx, { id: foreign.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
})
it('returns NOT_FOUND for a reservation at a property the member is not assigned to', async () => {
  const abuja = await createProperty(org)                // same organization, different hotel
  const elsewhere = await createReservation(abuja)
  await expect(get(ctx, { id: elsewhere.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await expect(create(ctx, { ...validInput, propertyId: abuja.id })).rejects.toMatchObject({ code: 'FORBIDDEN' })
})
it('lists only this organization’s reservations at the member’s properties', …)
```
Group-level resources (guests, companies) still get the cross-organization test; their property-scoped children (stays, folios) get the cross-property test.

## Audit events
Every write asserts its audit event, so a missing one fails a test rather than a review:
```ts
it('records who discounted the stay, why, and the before/after rate', async () => {
  await discount(ctx, { stayId, percent: '5', reason: 'Repeat corporate guest' })
  expect(await auditEventsFor(stayId)).toEqual([
    expect.objectContaining({ action: 'stay.discount', actorId: user.id, deviceId: device.id,
      businessDate: '2026-11-25', reason: 'Repeat corporate guest',
      before: expect.objectContaining({ rate: '50000.00' }), after: expect.objectContaining({ rate: '47500.00' }) }),
  ])
})
```
Also assert that a rejected action writes no audit event for the change, and that audit rows can't be updated or deleted.

## Permission limits and approval
For every action with a limit in the permissions matrix:
```ts
it('lets front desk discount up to their 10% limit', …)
it('rejects an 11% discount from front desk without an approver', async () => {
  await expect(discount(ctx, { stayId, percent: '11', reason: 'Long stay' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
})
it('accepts an 11% discount approved by the GM’s PIN on the same device', …)   // approver stored on the audit event
it('rejects approval by a member whose own limit is too low', …)
it('rejects a member approving their own over-limit discount', …)
it('uses the organization’s configured limit, not the seed default', …)
```
Limits are decimals as strings, so test the exact boundary (`'10'` passes, `'10.01'` needs approval).

## Leakage controls
- **Discrepancy check:** a room `occupied` at the front desk but reported vacant by the attendant raises a `sleeper`; a room `vacant` but reported used raises a `skipper`; matching statuses raise nothing; running the check twice for the same check time raises each discrepancy once; each must be resolved with a reason.
- **Blind count:** the shift-close response hides the expected total until the count is submitted; the variance is `counted − expected` and becomes an exception above the threshold.
- **Owner's daily report:** after night audit, each exception for that business date appears once with the staff member's name; nothing from another property or organization appears.

## No overbooking (concurrency)
Every service that changes availability (book, modify dates, room move, cancel, OOO, group block, channel import) needs a race test with real parallel transactions:
```ts
it('never sells the last room twice', async () => {
  const roomType = await createRoomType(property, { rooms: 1, overbookingLimit: 0 })
  const attempts = Array.from({ length: 5 }, () =>
    withNewConnection((db) => create({ ...ctx, db }, bookingFor(roomType, '2026-11-25', '2026-11-27'))))
  const results = await Promise.allSettled(attempts)
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter((r) => r.status === 'rejected')).toSatisfyAll((r) => r.reason.code === 'CONFLICT')
  expect(await availability(roomType, '2026-11-25')).toBe(0)
})
```
Also cover: an overlapping range (25–27 vs 26–28) where only the shared night is full; overbooking allowed up to exactly the configured limit and no further; a cancellation and a booking racing on the same date; and an OTA reservation replayed twice creates one reservation (idempotency).

## Business date and night audit
- Postings take the property's business date, not the clock: set the clock to 01:30 on 26 Nov with business date 25 Nov and assert the charge is dated `2026-11-25`.
- Night audit: runs once per property per date (a second run is a no-op), marks guaranteed non-arrivals as `no_show`, posts room and tax charges once per in-house stay, and rolls only that property's business date.

## Money
Test amounts as strings: `expect(balance).toBe('185000.00')`. Cover zero, part-payment, overpayment (credit balance), rounding of tax lines (VAT, consumption tax, service charge on inclusive and exclusive prices), splitting a bill, routing to a company folio, voids as linked reversals, and foreign-currency amounts with their FX rate and NGN equivalent. Folio balance and status are derived, so assert them after postings, and assert every ledger posting balances per entity.

## Offline sync
Replay the same queued action twice with one idempotency key → one row. Queue a POS check and a post-to-room while "offline", sync out of order → the server applies them in the device's order. A conflicting change (room taken meanwhile) returns a conflict the client can show, never a silent drop. A queue from a revoked device or a signed-out member is rejected at sync.

## Components
Query by role and label (`getByRole('button', { name: 'Check in' })`). Use `userEvent`, not `fireEvent`. Assert what the user sees.

## Playwright
- One spec per journey: `reservations.spec.ts` → create, find in list, edit dates, cancel; `check-in.spec.ts` → walk-in to checked-in in one flow; `pos.spec.ts` → order, send, post to room, appears on folio.
- Log in through a stored auth state (`e2e/.auth`) per role, not the UI in every test.
- Selectors: `getByRole`, `getByLabel`, `getByText`. No CSS selectors, and no `waitForTimeout`.
- Each spec seeds its own data through the API. The exceptions are `smoke.spec.ts` and the walkthrough journeys in `e2e/journeys/` (one per file in `docs/journeys/`), which run against a fresh `pnpm db:seed` demo group so names and numbers match the walkthroughs; each journey file starts from a fresh seed and freezes the business date.
- Shared-device journeys sign in with the PIN pad, and cover an over-limit action approved by a second member's PIN.
- Offline journeys use `context.setOffline(true)`, perform the action, go back online, and assert the server state.

## Naming and style
Test names are sentences describing behaviour. Arrange, act, assert, with no logic in tests. Keep each test under ~30 lines.

## Running
`pnpm test` (all unit/integration), `pnpm --filter api test -- reservation`, `pnpm e2e`, `pnpm e2e --ui` for debugging.
