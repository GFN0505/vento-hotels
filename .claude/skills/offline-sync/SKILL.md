---
name: offline-sync
description: How front desk, POS and housekeeping keep working through power and internet cuts — service worker app-shell caching, an IndexedDB outbox of commands with client UUID v7 and idempotency keys, what is allowed vs blocked offline, conflict rules, the offline banner and sync queue UI, and testing with Playwright offline mode. Use for any feature that must work offline or any endpoint that offline devices call.
---

# Offline sync

Front desk, POS and housekeeping must keep working when the power or internet drops, then sync when they're back. The rule: **queue commands (intents), not state**. The server stays the source of truth and decides the outcome of every command.

## Architecture
```
apps/web/src/offline/
  sw.ts              service worker: precache app shell, runtime caching for reference data
  db.ts              IndexedDB (idb) stores: outbox, cache snapshots, sync log
  outbox.ts          enqueue, flush, retry with backoff, dead-letter
  commands.ts        typed command definitions (from packages/shared) and which are offline-allowed
  useOnline.ts       connectivity state (navigator.onLine + a heartbeat to /health)
apps/api/src/modules/sync/
  router.ts          batch endpoint: apply commands in order, return per-command result
  idempotency.ts     idempotency_keys table lookups
```

## Service worker
- Precache the app shell (HTML, JS, CSS, fonts, icons) with a versioned cache; new versions activate on next load, with a "New version — reload" toast, never mid-transaction.
- Runtime cache (stale-while-revalidate) for **reference data** the offline screens need: rooms and statuses, today's arrivals/departures and in-house list, menus and prices for the device's outlet, tables, housekeeping assignments. Scoped to the member's properties only.
- Never cache API responses containing full ID numbers or ID images, and clear all caches and IndexedDB on sign-out of a personal device. On the front desk PC, today's and tomorrow's lists stay through PIN locks (decision 0029; `KEPT_THROUGH_LOCK` in `offline/saved-data.ts`) and go on full sign-out, device revoke and a new business date. On a **shared device**, a PIN user switch keeps the device's cached reference data and outbox (they belong to the device and property, not the person) but clears that member's session.

## Devices and PIN sign-in offline
- A device is registered by a manager and bound to one property; it holds a device credential. Only registered devices cache data or keep an outbox.
- For offline PIN sign-in, the device caches the PIN hashes (slow hash, salted per member) and roles of members allowed at that property, refreshed when online. A PIN check never sends the PIN anywhere and never stores it in plain text. Failed attempts count locally and lock out; the lockout syncs.
- Every command carries `deviceId` and the `memberId` who was signed in by PIN, so audit events name the right person.
- Over-limit approvals offline: the approver's PIN is checked against the cache and the approver id travels with the command; the server re-checks the approver's role and limit at sync and rejects if it no longer holds (→ needs attention).
- A **revoked device** gets no new data, its session ends at the next contact, and its queued commands are rejected at sync and listed for a manager, never silently applied.

## Printing offline
Receipts, bills and kitchen/bar tickets render from local data and print to a local printer (or the print bridge) without the API. The print and any reprint are queued as audit commands like any other write. See the `printing` skill.
- Mutations are never replayed by the service worker's background sync blindly; they go through the outbox.

## Outbox of commands
- Each command: `{ id: uuidv7(), idempotencyKey, type, payload, propertyId, deviceId, memberId, createdAt (device clock), baseVersion? }`. The `id` is generated on the client and becomes the created record's id, so the UI can reference it before sync (e.g. a POS check opened offline).
- Commands are typed in `packages/shared` with zod; the outbox validates before enqueueing.
- Flush in **creation order per device**, in batches, when online. The server applies each command in its own transaction and returns `applied`, `duplicate` (already applied — returns the original result), `rejected` (with reason) or `conflict`.
- The server stores `(organizationId, idempotencyKey)` unique with the result; a replay returns the stored result and creates nothing. This applies to every endpoint an offline device can call, not only the batch endpoint.
- Retries with backoff on network/5xx. `rejected`/`conflict` go to a **needs attention** list shown to the user; never silently dropped, never auto-retried forever.
- Dependent commands (e.g. "add item to check X" after "open check X") stay ordered; if the parent is rejected, children are marked blocked with a clear message.

## Allowed vs blocked offline
| Allowed offline | Blocked offline (show why) |
|---|---|
| POS: open check, add/remove items, send tickets (to a local printer if reachable; a kitchen display only if it's on the same local network and reachable — see open questions in `docs/DOMAIN.md`), split/merge, cash, POS-terminal and bank transfer payments (with reference; transfers stay "unverified" until matched online), voids and comps if the member has permission (reason still required) | New bookings, walk-ins, extensions or room-type changes that need live availability (e.g. new bookings for dates that may be sold out) |
| Housekeeping: room status changes, room checks, assignment progress, inspection results, minibar consumption, lost and found, fault reports (work orders) | Online payments (Paystack, VCC charges), refunds |
| Front desk: check-in of arrivals **already assigned** a room, with the registration typed on the device and the ID photo (ID numbers and the photo sealed on the device with WebCrypto AES-GCM until the server answers; built in brick 8 as `stays.checkIn`), record cash, POS-terminal and bank transfer deposits (transfers unverified until matched), guest registration details, key issued, notes | Post to room for a guest whose in-house status can't be confirmed from the cached in-house list; anything over the guest's cached credit limit |
| Read: tape chart snapshot, in-house list, folios as of last sync (marked as such) | Night audit, rate changes, cashier shift close, check-out that needs a final folio balance (allow "express check-out pending sync" only if configured) |

Offline-allowed commands are an explicit allow-list in `commands.ts`. Anything not on it is disabled in the UI while offline with a short reason.

## Conflict rules
- **Server wins on availability and folio balance.** The server recomputes availability under its normal lock and derives balances from postings. An offline check-in to a room that was meanwhile moved or put OOO returns `conflict` and is resolved by a person.
- Postings created offline are posted to the **business date at which the server applies them** unless night audit for the device's recorded business date hasn't run yet; if the date was closed, they post to the current business date with the original timestamp kept, and are flagged for the auditor.
- **Last-writer-wins only for room status**, compared by the command's timestamp (device clock checked against server time on reconnect; large skew flagged). Status changes older than the current status are recorded in history but don't override it.
- POS checks opened offline on two devices for the same table are both kept; they're merged by a person if needed.
- Never merge by overwriting whole records with client state.

## UI
- A visible **offline banner** (design tokens, not colour alone; text such as "Offline — changes will sync when you're back online") on every offline-capable screen.
- A **sync queue** indicator with the count of pending commands, last synced time, and a panel listing pending, failed and needs-attention items with retry/discard (discard needs confirmation and is logged).
- Records created offline show a "pending sync" badge until applied.
- Warn before sign-out or app update if the outbox isn't empty.

## Testing
- Unit tests: outbox ordering, retry/backoff, dependent commands, idempotent replay (same key twice → one record), each conflict rule, offline PIN sign-in and lockout, PIN switch keeping the outbox, an offline approval whose approver lost the permission before sync, a revoked device's queue rejected.
- API tests: the batch endpoint with duplicates, out-of-order delivery, rejected parents, closed business dates, and cross-organization/property keys (an idempotency key from another organization must not leak its result).
- Playwright e2e with offline mode: `await context.setOffline(true)`, perform the flow (open a POS check, add items, take cash; change a room status; check in an assigned arrival), assert the banner and queue count, `await context.setOffline(false)`, assert the queue drains and the server state is correct. Include a test that a blocked action is disabled offline, and one that reloads the page while offline (app shell from the service worker, outbox survives).
- Test on a throttled profile (slow 3G) as well as fully offline.
