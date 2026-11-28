# Architecture

How the code is laid out and how a request flows through it. The *why* behind the big choices is in `docs/decisions/`. Keep this file current when the structure changes.

Each section says honestly where it stands: **Built in brick N** (on `main`) or **Planned** (with the stage that brings it). Stage 0 is complete. Its bricks, as they were built: 1 monorepo skeleton, 2 local infrastructure, 3 shared basics, 4 database layer and API server, 5 sign-in and tenancy, 6 permissions and audit, 7 web shell, 8 team and roles, 9 feature switches, 10 shared devices and PIN, 11 app shell, 12 two-step sign-in, 13 visual pass on Home, 14 demo seed, 15 role homes, 16 offline shell, 17 jobs and monitoring, 18 deploy. The documentation system and the UX quality gates landed alongside them without a brick number. Stage 1 bricks are numbered afresh in `docs/specs/stage-1-plan.md`.

## Layout
*Everything below is built, in the brick shown, except what is marked Stage 1 or later.*
```
apps/
  api/                       Hono + oRPC server on Node 24
    src/
      app.ts                 Hono app: /health (200 or 503) and /rpc (oRPC)          (brick 4)
      router.ts              implements the shared contract; context per request     (brick 4)
      server.ts              starts the server, graceful shutdown                    (brick 4)
      env.ts                 zod-validated environment, fails fast on start           (brick 4)
      rate-limit.ts          per-key limits for Vento's own public procedures         (brick 8)
      system/health.ts       database, storage and jobs checks behind /health          (bricks 4, 17)
      infra/                 settings reader (zod) and database/storage checks        (bricks 2–3)
      db/columns.ts          id (uuidv7), timestamps, archivedAt, amount, currency    (brick 4)
      db/client.ts           pg pool + Drizzle, snake_case columns                    (brick 4)
      db/schema/             auth.ts (Better Auth), tenancy.ts, governance.ts          (bricks 5–12); rooms.ts, finance.ts (Stage 1)
      db/migrate.ts          applies migrations as a release step, never on app start (brick 4)
      auth/auth.ts           Better Auth: email + password, organizations, two-step, /api/auth/* (bricks 5, 12)
      tenancy/access.ts      loadAccess, scopeToProperties, requirePermission, requireWithinLimit (bricks 5–6)
      tenancy/service.ts     the member's organization, Home figures                  (bricks 5, 15)
      tenancy/properties.ts  hotels: list, read, add, edit, scheduled company change (Stage 1); property-views.ts
                             reads a hotel with its company, logo link and room count in one query
      tenancy/property-archive.ts  archive (revokes devices, cancels invites for it alone) and restore;
                             archive-blockers.ts is the hook later bricks add their checks to (Stage 1)
      tenancy/entities.ts    companies: list, read, add, edit, archive, restore      (Stage 1)
      tenancy/logo.ts        hotel logos: signed upload URL, checks, set/remove, daily purge (Stage 1)
      tenancy/scheduled-entity.ts  applies a live hotel's scheduled company change; night audit calls it (Stage 1)
      audit/record.ts        recordAudit / recordAuditMany(tx, access, …), same transaction (brick 6)
      governance/service.ts  audit log, permissions matrix list/set                  (brick 6)
      team/                  members list/update/remove, invitations, join from link   (brick 8)
      features/              feature switches per group, `pnpm features` command       (brick 9)
      devices/               shared devices, staff PINs, PIN sign-in, PIN session rules (brick 10); the shared
                             wrong-try counter (pin-counter.ts) and background reads that don't count as
                             activity (session-guard.ts) (Stage 1 brick 5)
      approvals/             approvals (Stage 1 brick 5, decision 0027): the approver list and eligibility,
                             approve here and the inbox (service.ts), use at Book under lock (use.ts),
                             the expiry job (expire.ts), kinds/ (stay-discount: permission, feature,
                             pricing into a value, binding hash and subject; change-kinds and
                             change-rules: modify_discount and penalty_waiver, brick 6; cash-variance:
                             a cashier shift's difference over the limit, brick 9)
      cash/                  cashier shifts (Stage 1 brick 9): drawers/ (cash drawers per hotel with their
                             POS terminals, Desk 1 made with every hotel); shifts/ open with the hand-over
                             (open.ts), the lines to count (lines.ts), the blind count and its snapshot
                             (count.ts), close with reason, approval and safe drop (close.ts), My shift, the
                             Shifts list and detail (read.ts), views built by status (views.ts), the
                             approval bindings (variance.ts) and expected.ts, the seam for brick 10's
                             payments (`expectedFor`: pure over the shift's payments)
      rooms/                 room types and rooms per property: reads, writes, bulk, locks,
                             connecting rooms, "Add rooms by floor" with new types (room-batch.ts),
                             Mark inspected, the roomCountChanged hook (Stage 1); status/ Mark clean /
                             dirty, idempotent for the offline outbox (brick 7); out-of-order/ check,
                             create, change dates, back in service or remove (brick 7)
      finance/               taxes and charges (taxes.ts reads, rules in force and quotes; tax-writes.ts set up,
                             schedule, cancel, verify), payment methods, bank accounts (guest transfer account and
                             the owners' email), POS terminals, FX rates (Stage 1 brick 3)
      rates/                 rate plans and rates per property (Stage 1 brick 2): plan reads and writes,
                             the first-rate table, the rate calendar, Change dates with Undo, the
                             "₦0 or less" and "lowered tonight" guards (guards.ts), quoteStay and
                             listBookablePlans for bookings (quote.ts), the Rooms base rate and Home's
                             "Set rates" step (base-rate.ts)
      reservations/          availability and new reservations (Stage 1 brick 4): the inventory locks and
                             their order (locks.ts), the booking service bookInTx (book.ts), pricing a stay
                             (pricing.ts: discount, tax lines per night, deposit, cancellation, the hash),
                             availability, quote, list, detail, guest search and find-or-create (guests.ts);
                             change/ (brick 6): pricing a changed stay (price-change.ts), quoteChange,
                             modify, cancel and no-show (end.ts), penalties and waivers (penalty.ts,
                             waive.ts), the change frame with its key lock and replay (transaction.ts);
                             the room of a changed stay (room.ts, room-write.ts, brick 7);
                             assign/ (brick 7): is a room free (room-check.ts, under the room lock),
                             room options for the Room move dialog, assign / move / unassign within
                             the type (assign.ts)
      tape-chart/            the one read behind the tape chart and the day list (get.ts), a hotel's
                             rooms with status and connections, tonight's and plan prices (brick 7)
      seed/                  the demo group for development and sales demos (`pnpm db:seed`) (brick 14); rooms.ts: 382 rooms; rates.ts: 14 rate plans and Victoria Island's dates (Stage 1); reservations.ts: about 450 reservations booked through the booking service (Stage 1 brick 4)
      jobs/                  pg-boss queue, email retries, heartbeat                   (brick 17); daily purge of unconfirmed uploads (Stage 1)
      observability/         pino logs with request ids, Sentry error reports          (brick 17)
      providers/email.ts     EmailProvider and its console, file and memory versions   (brick 5); SMS, WhatsApp, payments, channel manager as each stage needs them
      providers/storage.ts   StorageProvider: S3 API (RustFS locally, R2 in production) and an in-memory version (Stage 1)
      storage/               what an uploaded image really is (PNG/JPEG from its bytes); PNGs for the seed and tests (Stage 1)
      test/harness.ts        signs real people in for tests through Better Auth        (brick 5)
      pdf/                   @react-pdf/renderer documents                            (Stage 1)
    drizzle/                 generated SQL migrations, committed (0000–0019)          (bricks 4–12, Stage 1)
  web/                       Vite + React 19 SPA
    src/
      routes/                sign-in, get-started, setup, forgot/reset password, join, lock, _app (shell): Home, module pages, settings (bricks 7–12)
      components/ui/         Button, Field, Card, Dialog, PageHeader, StatTile, EmptyState…: design tokens only (bricks 7–13)
      components/shell/      sidebar, top bar, hotel switch, account menu, preview and offline banners (bricks 7–16)
      components/home/       Home by role and hotel: banner, figures, hotels, attention, workspace (bricks 13, 15)
      components/team/, two-step/  invite and member dialogs, two-step set-up          (bricks 8, 12)
      components/logo.tsx    the Vento mark from the designs                          (brick 7)
      styles.css             tokens ported from design/export/vento.css, light + dark (brick 7)
      lib/api.ts             typed oRPC client + TanStack Query utils                 (brick 7)
      lib/auth.ts, session.ts  Better Auth client; picks the member's group on sign-in (brick 7)
      lib/device-session.ts  PIN sessions: idle lock and the Lock button               (brick 10)
      lib/navigation.ts      the menu: modules, their feature switch, which roles use them (brick 11)
      lib/me.ts, view-as.tsx the member's role, permissions and features; role preview  (bricks 9–11)
      observability/         Sentry for the web app, loaded after first paint          (brick 17)
      offline/               connection state, saved data in IndexedDB, update prompt (brick 16); the outbox
                             (outbox.ts, its own IndexedDB database) with its first command, Mark clean /
                             dirty (Stage 1 brick 7)
      components/tape-chart/ the tape chart grid, bar card, room menu, extend popover, phone day list (brick 7);
                             components/rooms/ room-move-dialog.tsx and out-of-order-dialog.tsx
    sw/                      the service worker and the build step that emits /sw.js   (brick 16)
    e2e/                     Playwright, desktop + phone: onboarding, team, devices, shell, two-step, home, offline, accessibility (bricks 7–16)
packages/
  shared/                    the single source of API types
    src/
      money.ts               Decimal, toAmount, money maths, FX, formatMoney           (brick 3)
      ids.ts                 newId() UUID v7, idSchema                                 (brick 3)
      dates.ts               calendar dates, nights, property-time-zone date           (brick 3)
      pagination.ts          page query and { items, page, pageSize, total }           (brick 3)
      locale.ts              NGN default, supported currencies, Africa/Lagos, states    (brick 1)
      lgas.ts                the 774 LGAs by state                                     (Stage 1)
      company-ids.ts         RC number and TIN rules                                   (Stage 1)
      roles.ts, password.ts  the 16 hotel roles; the password rule                     (bricks 5, 7)
      permissions.ts         permission keys, limit kinds, default matrix            (brick 6)
      rooms.ts               room fields, numbering, "Add rooms by floor" expansion   (Stage 1)
      rates.ts               rate plan fields and the pricing maths: derived prices rounded half-up to
                             the naira, weekend nights, date prices, restrictions, quotes (Stage 1)
      taxes.ts               tax kinds, categories and bases; `taxLines` (every tax line comes from it) (Stage 1)
      fx.ts, payments.ts     FX display helper and typo check; payment methods, banks, NUBAN, terminal IDs (Stage 1)
      features.ts            the feature catalog (decision 0021)                       (brick 9)
      devices.ts, pin.ts     device kinds and idle times; the PIN rule                 (brick 10)
      contracts/             the oRPC contract: system, tenancy, governance, team, devices (bricks 4–10), rooms, rates, finance (Stage 1)
deploy/                      images, compose.yml, Caddyfile, backups, server bootstrap (brick 18)
```
New modules from Stage 1 add their own folder in `apps/api/src/` (service, router, tests next to them) and their schemas and contract in `packages/shared/src/`, following the `add-module` skill.

## A request, end to end
*Steps 3.1–3.3 built in brick 5: `authed` and `inOrganization` in `apps/api/src/router.ts`, scoping with `scopeToProperties()`. Steps 3.4 and 5 built in brick 6: `requirePermission` / `requireWithinLimit` in each service and `recordAudit` in its transaction; approval (by PIN on a registered device, or from the approvals inbox) built in Stage 1 brick 5 for over-limit discounts (decision 0027); device sessions in brick 10. Step 1 (the typed web client) built in brick 7, same origin as the API (decision 0019). Step 6's request logs and error reports built in brick 17.*
1. A screen calls the typed oRPC client. Its input and output types come from the contract in `packages/shared`, so a mismatch is a compile error.
2. The browser sends `POST /rpc/<module>/<procedure>`. Hono adds a request id and security headers.
3. oRPC validates the input against the zod schema, then runs the middleware in this order:
   1. **Auth:** Better Auth session, or a device session with a staff PIN on shared devices. No session, no request.
   2. **Organization:** the organization comes from the session, never from input. Every query filters by it.
   3. **Property scope:** the property in the request must be one the member is allowed; the property's business date is loaded into the context.
   4. **Permission and limit:** module × action from the permissions matrix. Above the member's limit, the request needs a valid approval (approver's PIN or approvals inbox), never the member's own: the action carries an approval id, and the service locks that row in its own transaction, checks it is approved, unused, unexpired, the requester's, bound to exactly this action (a hash the server computes) and that the approver is still eligible, then marks it used (`approvals/use.ts`). Sensitive actions need a reason.
4. The **handler** calls a service that does all its writes in one database transaction.
5. In the same transaction an **audit event** is written: who, device, property, business date, action, before/after, reason, approver.
6. The **response** is validated against the output schema and returned. One JSON log line per request with request id, organization id and property id, never guest personal data. Unexpected errors go to Sentry with the request id; the client sees a generic message.

## Hotel switch
*Built: the switch and All hotels (`components/shell/property-context.tsx`, Stage 0 role homes), the leave guard (`useLeaveGuard`), and pages that follow it: Home, Hotels, Companies, Rooms. Stage 1 brick 1b ([spec](specs/stage-1-hotel-switch-scope.md)): `members.list`, `invitations.list`, `devices.list` and `entities.list` take `propertyId`, Home counts invites per hotel, and the client below is built: `useScope`/`scope` in `property-context.tsx`, the eyebrow in `PageHeader`, `useScopedTitle` (`components/shell/use-scoped-title.ts`), `?hotel=` in `components/shell/hotel-link.tsx`, the hotel-change reset in `components/shell/hotel-change.tsx`, the shared `PickHotel` in `components/shell/`, and the pure rules (link resolution, `keepWithinHotel` for `placeholderData`) in `lib/scope.ts`.*
- **The rule:** with one hotel selected, every page shows that hotel only. With All hotels, group pages show every hotel, named on each row; hotel pages ask to pick one; group-wide pages (Permissions and limits) are the same either way. UX checklist: `docs/UX-STANDARD.md` §8.
- **Client only:**
  - The selection lives in `PropertyProvider`, remembered per browser in `localStorage` (`vento.propertyId`, `all`; `vento.lastPropertyId`). The server has no "current hotel".
  - Pages read their scope from one hook (`{ kind: 'hotel', hotel } | { kind: 'all' }`), never from `current` when All hotels is selected.
  - `PageHeader` shows the scope eyebrow, and `useScopedTitle` sets the tab title. Hotel pages with All hotels use the shared `PickHotel` panel.
  - The shell handles `?hotel=<id|all>` on any route: it selects the hotel and tidies the URL. On a hotel change it resets paging and record sheets and moves focus.
- **Requests name their hotel:**
  - Every list of hotel-bound data takes an optional `propertyId`, and every write a required one.
  - Query keys include it, so one hotel's cached data is never shown under another's name.
  - Offline commands keep the `propertyId` they were made with, whatever the switch says when they sync.
- **The server decides:**
  - A list given a `propertyId` calls `requireListableHotel(db, access, propertyId)` (`tenancy/access.ts`): in the organization and the member's access (`propertyScope`), else NOT_FOUND "We couldn't find that hotel" (`data.code` `PROPERTY_NOT_FOUND`, from the shared `hotelNotFound` in `tenancy/errors.ts`, also used by the rooms pages); not archived, else NOT_FOUND "This hotel was archived." (`PROPERTY_ARCHIVED`) Then it filters within the existing scope.
  - Without a `propertyId`, a list returns everything within the member's access, as before. The switch only narrows.
  - "Works at" a hotel (assigned to it, or whole-group access: owner and group admin by role, or "Whole group") is one server predicate, `worksAt` in `team/rules.ts`, shared by `members.list` and Home's per-hotel people. Its twin `invitedTo`, with `openInvite` (pending, expired links included), does the same for `invitations.list` and Home's invite counts. `members.list` with a hotel also returns `wholeGroup`, the count of whole-group people there.
  - `devices.list` without a `propertyId` lists only devices at active hotels (an archived hotel's devices were revoked with it; their history stays in the audit log).

## Offline path
*Built in brick 16: the shell. Built in Stage 1 brick 7: the outbox, with its first command (Mark clean / Mark dirty, decision 0024).*
- **Built (brick 7):** `offline/outbox.ts` keeps commands in their own IndexedDB database (`vento-outbox`), so signing out or locking a shared device never drops one. A command carries the device's key and time and the member who made it, and is sent only while that member is signed in, oldest first, when Vento can be reached again; the server stores the key (`room_status_commands`) and applies it once. Room status is last-writer-wins by device time: an older change comes back `superseded`, stays in the queue's "needs a look" list with the server's sentence, and is kept in history. The tape chart (`tapeChart.get`) is kept with the saved data so it opens read-only offline. Everything else on the chart is disabled offline with its reason.
- **Built:** the service worker keeps the built app on the device (pages network-first, built files cache-first, never API calls). Before the first render, `offline/saved-data.ts` restores the reference data last seen from IndexedDB (an allow-list of queries), and `lib/session.ts` falls back to the remembered person when Vento can't be reached. `offline/connection.ts` treats a request that never reached Vento as offline; the shell shows `OfflineBanner`. Sign-out and device lock clear it all.
- Front desk, POS and housekeeping run from a cached app shell and local data in IndexedDB.
- Each change offline becomes a **command** in an outbox with a client UUID v7 and an idempotency key, the device id and the time it happened.
- When the connection returns, commands are sent in order through the same middleware chain as any request. The server stores the idempotency key, so a resent command is applied once.
- Conflicts (room already taken, bill closed elsewhere) are resolved by the rules in the `offline-sync` skill and shown on the sync queue screen; nothing is silently dropped.
- Actions that need the server to be safe (a new booking that takes inventory, refunds, night audit) are blocked offline with a clear message.

## Local services
*Built in brick 2.*
- `docker-compose.yml` runs **Postgres 18** (`vento-hotels-postgres`, port 5433, databases `vento_hotels` and `vento_hotels_test`) and **RustFS** storage (`vento-hotels-storage`, API 9100, console 9101). Names, ports and volumes are unique to this project (decisions 0015, 0016).
- `pnpm db:up` starts both and waits until healthy, `pnpm db:down` stops them, `pnpm db:reset` deletes their data and starts fresh, `pnpm db:status` checks both are reachable.
- `apps/api/src/infra/` holds the reachability checks; their tests run against the real services locally (with `.env`) and in CI.

## Data
*Built in brick 4 (database layer, column helpers, append-only guard). Built in brick 5: users, sessions, organizations, members, invitations, entities, properties and member_properties (migration 0001). Built in brick 6: audit_events (append-only trigger) and permission_overrides (migration 0002). Built since: invitation_properties (0003, brick 8), organization_features (0004, brick 9), devices, member_pins and sessions.device_id (0005–0006, brick 10), two_factors (0007, brick 12).*
- **PostgreSQL 18** with Drizzle ORM; migrations generated by drizzle-kit into `apps/api/drizzle/`, reviewed before applying (`db-migration` skill), and applied by `pnpm db:migrate` as a release step, never on API start. Locally in Docker on port **5433** (brick 2).
- **Append-only guard:** migration 0000 adds `vento_forbid_update_delete()`. Every append-only table (folio postings, payments, ledger entries, stock movements, audit events) attaches it as a `BEFORE UPDATE OR DELETE` trigger, so history can't be changed even by a hand-written query.
- Every domain table has `organizationId`; operational tables also have `propertyId`. Both NOT NULL and indexed.
- **IDs** are UUID v7, generated on the server or, for offline commands, on the device.
- **Money** is `numeric(14,2)` with a currency code beside it; foreign amounts also store the FX rate, source and date. Calculated with a decimal library, never floats.
- **Folio postings and ledger entries are append-only.** Corrections are reversals with a reason. The ledger balances per entity.
- **Business date** is a `date` per property that only moves forward at night audit. Charges, revenue and reports use it, not the wall clock.
- **Availability locking:** booking, modifying, cancelling and channel ingest lock the room-type inventory rows for the dates (`SELECT … FOR UPDATE`) in one transaction. Overbooking only up to a configured limit.
- **Rooms** (migration 0008, Stage 1 brick 1): `room_types`, `rooms` and `room_connections` per property, and `properties.live_since` (go-live). All three reference their hotel by a composite foreign key `(organization_id, property_id) → properties(organization_id, id)` (migration 0009), so a row can't name another group's hotel. A room's type is a composite foreign key `(property_id, room_type_id)`, so a room can't use another hotel's type even by a hand-written query; connecting rooms are one row per pair. Room numbers are unique per hotel including archived rooms (a database constraint), so concurrent bulk adds can't create the same room twice. **The number of rooms in a type is never stored**: it is counted from active rooms. Every change to it (create, bulk create, archive, restore, delete, change type, archive a type) calls `roomCountChanged(tx, …)` in `apps/api/src/rooms/room-count.ts` inside its transaction; it does nothing yet, and brick 4 makes it lock and adjust the room-type inventory rows from the business date on. Room writes hold their types `FOR SHARE` and archiving a type takes it `FOR UPDATE`, so a type can't be archived while rooms are being added to it.
- **Hotels and companies** (migration 0010, Stage 1): `properties` and `entities` gain a `version` (each save sends the version it started from, so nobody overwrites someone else's change) and case-insensitive unique names per group, archived included; a company's RC number and TIN (compared by digits) are unique per group. A live hotel's change of owning company is stored as `pending_entity_id` + `pending_entity_from` (the next business date) and applied by night audit, so a business date is never split between two companies' books; a composite key `(organization_id, pending_entity_id) → entities(organization_id, id)` keeps it in the group. `file_uploads` records every file sent to storage (`pending → confirmed | rejected | expired`), with a composite key to its hotel; `properties.logo_upload_id` points at the current logo. Migration 0011 makes a hotel's company (`entity_id`) and logo composite keys with `organization_id` too, adds the uploader's member key, and stores a live company's scheduled VAT registration change (`pending_vat_registered` + `pending_vat_from`, applied by night audit like the company change). Writes that attach something to a hotel (devices, invitations and access grants, rooms and room types) hold the hotel row `FOR SHARE` in their transaction, and archiving takes it `FOR UPDATE`, so nothing new lands on a hotel while it is archived.
- **Rate plans** (migration 0013, Stage 1 brick 2): `rate_plans` (terms, own or derived, a self-referencing composite key `(property_id, parent_id) → rate_plans(property_id, id)` so a parent is always in the same hotel, `version` for "someone else saved first"), `rate_plan_room_types` (the room types a plan sells, with the standard weekday and Fri–Sat prices on own-price plans) and `rate_dates` (one row per own-price plan × room type × night with a date price, restrictions or a season name; a row with nothing set is deleted). All carry `organization_id` and `property_id` with composite keys to their hotel; money is `numeric(14,2)` with `currency` (NGN only, a check), percentages `numeric(7,4)`, and check constraints mirror the form rules (whole naira, one adjustment, meal allocation with meal plans). **A derived plan's prices are never stored**: every reader prices through `@vento/shared`'s maths (`rates/pricing-data.ts` loads the inputs), and every rates write re-checks inside its transaction that no derived plan drops to ₦0 or less and, after go-live, that tonight's prices didn't go down without a reason. Each Change dates apply and Undo is a row in `rate_date_batches` (migration 0014: batch id unique, business date, the audit event holding its cells, undone by), which answers replays, Undo and Undo's night-audit expiry. Prices don't move inventory, so no availability lock is taken; `quoteStay` takes the hotel's rates lock in shared mode and returns a `quoteHash` brick 4 compares before booking; bookings (brick 4) call `quoteStay` inside their own transaction. Every rates write, and a room type restore (which puts the type back on plans), first takes one transaction-scoped advisory lock per hotel (`lockHotelRates` in `rates/context.ts`), then plan rows, then room types, so rates writes at a hotel queue instead of deadlocking; a restore also bumps the version of every plan the type comes back on, so an editor opened before it gets "someone else saved first".
- Statutory rates (VAT, consumption tax, service charge, payroll deductions) are versioned configuration with effective dates.
- **Reservations** (migration 0016, Stage 1 brick 4): `room_type_inventory` (one row per room type per night with `booked`, created on first use; unique `(room_type_id, date)`), `guests` (group-wide, a generated lower-case `search` column with a `pg_trgm` GIN index; 0016 is the first migration to create an extension), `reservations` (number and idempotency key unique per group, the request's hash beside the key), `stays` (terms snapshot as `jsonb`, discount and restriction override, composite keys to room types and rate plans), `stay_nights` (plan and sold price per night; a check keeps sold ≤ plan and ≥ the meal allocation) and `reservation_counters` (`last` per hotel per `YYMM`). `properties.booking_prefix` (backfilled in the migration, unique per group) and `room_types.overbooking_limit` (0). **Rooms in a type are counted live after the inventory lock, never stored on the inventory row.** Every booking goes through `bookInTx` (`reservations/book.ts`) in one transaction, in one lock order everywhere (header of `reservations/locks.ts`): (0) an advisory lock on the request's idempotency key, so a double press queues and finds the first booking; (1) the hotel's rates advisory lock, shared; (2) the hotel's row `FOR SHARE`; (3) rooms then room types (room writes only); (4) the inventory rows `FOR UPDATE` ordered by room type id, then date (inserted first with `ON CONFLICT DO NOTHING`, in the same order); (5) approval rows `FOR UPDATE` by id, for a discount over the limit (brick 5); (6) a picked guest's row; (7) the counter upsert. Then `quoteStay` per stay, tax lines from `rulesByNight` (one load of the hotel's taxes for all nights; the booking never calls the taxes-read procedures, which the front desk can't), the discount limit, the hash against the quoted one (`PRICE_CHANGED`), inserts, `booked + n` in one statement, audit events. Room count changes (`rooms/room-count.ts`, now filled) create the removed types' rows eagerly from the business date to the last rate date, lock them in the same order and refuse `ROOMS_BOOKED`; they take no rates lock (they never touch prices, and bookings never lock rooms or room types, so no cycle). Concurrency is tested on separate connections against the test database (`reservations/book.concurrency.test.ts`): a gate client holds the inventory row until both bookings are queued on it (it clears `pg_stat_activity`'s per-transaction snapshot while polling), then lets go; 200 last-room races, 200 opposite-order multi-room races with no deadlock, a randomised counter invariant and archive-versus-booking races.
- **Cashier shifts** (migration 0020, Stage 1 brick 9): `cash_drawers` (per hotel, a name unique among active drawers, archived never deleted; the migration made Desk 1 at every hotel and creating a hotel makes it in the same transaction), `cash_drawer_terminals` (composite keys keep the drawer and terminal in one hotel; `pos_terminals` gains a `(property_id, id)` key for it), `cashier_shifts` (number per hotel per business date, the person and device, the float by note, the hand-over, the terminals fixed at opening, the count's and the close's business dates, the float kept, the safe drop and bag, three idempotency keys unique per group) and `cashier_shift_count_lines` (one per line counted: counted, expected and difference, FX rate, source and date for foreign cash, and the naira equivalents). Partial unique indexes keep **one shift not closed per drawer and per person**. Two triggers: count lines are **append-only** (`vento_forbid_update_delete`), and a shift's status only moves `open → counted → closed`, it is never deleted and what each step recorded stays as it was (`vento_cashier_shift_forward`). **Lock order:** open takes the hotel `FOR SHARE`, an advisory lock on the person, the drawer `FOR UPDATE`, the approval `FOR UPDATE` (a hand-over over the limit), then an advisory lock on the hotel's shift numbers; submit and close take the shift row `FOR UPDATE`, close then the approval. Brick 10's payments will take the shift row `FOR SHARE` before their folio rows, so a payment and a count never interleave. **The count is blind:** the views are built by status, an open shift's schema has no expected, counted or difference field (the contract's output validation strips anything else), and `expectedFor` is called only inside the submit transaction, whose response is the first to carry expected figures. Tested in `cash/shifts.test.ts` (blindness across every procedure for the cashier, GM and owner, the snapshot, FX, the triggers, reason, float, bag, limit and approval, permissions, isolation) and `cash/open.concurrency.test.ts` (two people on one drawer, one person on two drawers, opening at once).
- **Tape chart, room moves and room status** (migration 0019, Stage 1 brick 7): `room_out_of_order` (one period per room: From to Back in service, exclusive like a departure, reason, note, who and the business date, `active` or `removed`, a version and the last change's key), `room_status_commands` (the receipt of every Mark clean / dirty, unique key per group, `applied` or `superseded`), `rooms.housekeeping_status_at` / `_by_member_id` / `_by_name` with a check that only `clean`, `inspected` and `dirty` are stored, `discount_reason` gains `upgrade` and `reservation_change_kind` gains `room`. The migration creates `btree_gist` and two **exclusion constraints**: no two `confirmed` or `checked_in` stays in one room on overlapping nights (`stays_room_no_overlap`), and no two active out-of-order periods of one room overlapping. **Rooms left = active rooms − active rooms out of order that night − booked**: `capacityOf` (`reservations/locks.ts`) returns each type's active periods and `leftOn(capacity, booked, date)` counts per night, read after the inventory lock, for New reservation, Modify, room count changes and the chart. Lock users: a same-type assign, move or unassign takes the hotel (2), the reservation row (2b), then the old and new rooms in id order (3), no inventory; a move to another type or a drag-extend is brick 6's modify with the target room locked at 3, before the inventory rows; a booking from a chart cell locks the room at 3 before inventory; out of order takes the hotel (2), its room (3), then the period row and its type's inventory rows for the nights added (4); Mark clean / dirty locks only the room row. Every assignment and every out-of-order write locks the room row, so the stay-against-out-of-order check (two tables) is safe; the constraints are the last line of defence and their violations are answered as `ROOM_TAKEN` or `OOO_OVERLAPS`. An upgrade at the booked price is priced by `priceChange` with `keepBookedPrice`: each night keeps its sold price, and the difference to the new type's plan price is a discount with reason Upgrade, checked against the mover's limit or a `modify_discount` approval (its hash covers the target room). Archiving a room or changing its type is refused while it has an assigned future stay or an active or upcoming period (`requireRoomsFree` in `rooms/room-count.ts`). Room status is idempotent (the device's key) and last-writer-wins by device time: an older change is kept as a superseded receipt and audit event. Tested in `reservations/assign/assign.test.ts`, `rooms/out-of-order/out-of-order.test.ts`, `rooms/status/status.test.ts`, `tape-chart/tape-chart.test.ts` and `reservations/assign/assign.concurrency.test.ts` (200 rounds each: two assignments for the last free room, out of order against a booking of the last room, out of order against an assignment to the same room, a drag-extend against an assignment on the new night, two out-of-orders for a type's only spare room, an out-of-order extension against a booking of the last room, two status changes on one room where the later device time wins; crossed-type moves with no deadlock; a randomised counter and room invariant), and `tape-chart/isolation.test.ts` (another group and a member limited to another hotel). A queued command whose session ended (401) stays waiting and is sent after the next sign-in.
- **Changes, cancellations and penalties** (migration 0018, Stage 1 brick 6): `reservation_changes` (every modify, cancel, no-show and waiver with `before`/`after` jsonb, idempotency key unique per group with the request's hash) and `penalties` (`to_charge → charged` from brick 10, or `waived` with who, why and the approver; checks keep the waived columns set only when waived), `reservations.ended_*` and `end_reason`, `stays.version`, approval kinds `penalty_waiver` and `modify_discount`. Every change goes through `reservations/change/` in one transaction: the change's key advisory lock, the rates lock (shared), the hotel row (`FOR SHARE`), the replay check, then **the reservation row `FOR UPDATE` (lock step 2b)**, the stay version check (`RESERVATION_CHANGED` names who changed it), the inventory rows for the **union of the old and new nights** in one statement (room type, then date), approvals in id order, then the penalty. Old nights are released and new ones taken as net counts per row, so kept nights aren't written. A changed stay is priced by `priceChange` (kept nights keep their stored prices; new nights from the same plan via `quoteStay`; the passed-deadline and late-change rules from `@vento/shared`'s `changes.ts`), and its hash is compared with the one the dialog showed. Answering a `penalty_waiver` in the inbox applies it in the approver's transaction, locking the reservation row before the approval row (decision 0028). Tested in `reservations/change/change.test.ts` and `change.concurrency.test.ts` (an extension racing a booking for the last room, 200 rounds; a cancel racing a modify; a booking waiting on a cancel's release; crossed room types; an inbox waiver racing a cancel; a randomised counter invariant counting only `confirmed` and `checked_in` stays).

- **Taxes, payments and FX** (migration 0015, Stage 1 brick 3): `taxes` (VAT one per group, state taxes per state code, a service charge per hotel; partial unique indexes enforce it) with dated `tax_rates` versions. A trigger refuses deleting a version or changing anything but its verification and the cancelling of a scheduled one, so history can't be rewritten by hand. `tax_templates` holds Vento's illustrative starting rules (VAT, Lagos consumption tax, 10% service charge), copied in only by "Set up for …"; calculations read only the group's own rules. `rulesByNight` (one load, the rules for each of a stay's nights; `rulesInForceFor` is one night of it) and `taxRulesInForce`/`quoteTaxLines` (`finance/taxes.ts`) give the rules for a hotel on a business date (VAT only while its owning company is VAT registered that day) and refuse with `TAXES_NOT_SET_UP` when there are none; every line comes from the shared `taxLines`. `bank_accounts` belong to a company (composite key), `payment_method_settings` per hotel and method (the guest transfer account sits on the bank transfer row), `pos_terminals` per hotel settling into a company account, terminal IDs unique in the group. `fx_rates` are group-wide, one live rate per currency, date and source; a replacement supersedes the old row, and a trigger refuses deletes and edits.

## Background jobs
*Built in brick 17: the queue, email retries and the heartbeat (decision 0025). Stage 1 adds the first business jobs.*
pg-boss on the same Postgres, no Redis. `apps/api/src/jobs/queue.ts` holds each job's zod schema, queue options and handler; the API process starts the workers when `JOBS_ENABLED` is true, and `/health` reports `jobs` from a heartbeat every minute. Email already goes through the `email.send` queue. `storage.purgeUnconfirmed` runs daily at 03:30 UTC and deletes uploads given a signed URL but never confirmed within 24 hours. `approvals.expire` (Stage 1 brick 5) runs every minute: open approvals past their 30 minutes or their business date are stored as expired with their draft cleared and one `approval.expired` system event each; reads compare the time themselves, so nothing waits on the job. Used for night audit steps, ARI pushes to the channel manager, payment and channel webhooks, guest messages, the owner's daily report, scheduled checks (room discrepancy, deposits due) and large imports. Every job is idempotent and retried with backoff; failures are visible to devops.

## Files and PDFs
*Local storage service built in brick 2; uploads built with hotel logos (Stage 1); PDFs planned (Stage 1).*
- **Files** go to S3-compatible storage: RustFS locally (brick 2, decision 0016), Cloudflare R2 in production, through `StorageProvider` (`apps/api/src/providers/storage.ts`, S3 API only, path-style URLs, signed with `aws4fetch`). Nothing is public: files are read through signed GET links (an hour for logos). Guest ID images will sit in a separate private bucket with short-lived links.
- **Uploads** never pass through the API. The API records a `file_uploads` row and returns a signed PUT URL (5 minutes) whose content type, length and `If-None-Match: *` are part of the signature, so storage refuses any other file and any second file under the same link (412). The browser PUTs the file to its upload key (`logos/{organizationId}/{propertyId}/uploads/{uploadId}.png` (or `.jpg`, `.webp`)), then calls the confirm procedure. The API copies it server-side to its checked key (the same without `uploads/`), which no signed URL ever pointed at, deletes the upload key, and checks the copy: its real type from its first bytes (PNG, JPEG or WebP; never SVG) and its size. Dimensions are recorded when readable, but no rule depends on them. Only the checked key is ever shown, so nothing sent later can change a checked file. A file that fails is deleted. Uploads must be confirmed within an hour; the daily purge deletes unconfirmed and rejected uploads' files after a day (`purged_at`). Every upload has its own keys, so nothing is overwritten and documents already issued keep what they showed. Storage calls time out after 15 seconds.
- **Settings:** `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`. Without the last three the API runs with uploads switched off. Locally (`DEPLOY_ENV=local`) the API creates the bucket on start and allows uploads from any `http://localhost:*` origin; R2's bucket CORS is set up with the servers (`docs/ops/deploy.md`).
- **PDFs** (registration cards, invoices, folios, statements, payslips, board packs) are rendered on the API with `@react-pdf/renderer`. Thermal receipts and kitchen tickets are 80mm browser print layouts (`printing` skill).

## Providers behind interfaces
*Built in brick 5: `EmailProvider` (console, file and memory versions; no real provider chosen yet). Built in Stage 1: `StorageProvider` (S3 and memory versions). The others are planned, as each stage needs them.*
Every outside service sits behind an interface in `apps/api/src/providers/` with a fake for tests and local work: `EmailProvider`, `SmsProvider`, `WhatsAppProvider`, `PaymentProvider` (Paystack), `ChannelProvider` (one certified channel manager), `StorageProvider`. Which provider to use is an open question in `docs/DOMAIN.md` until decided in `docs/decisions/`.

## Environments
*Built in brick 18: Contabo servers running Docker Compose, deployed from GitHub Actions (decision 0026). Runbook: [ops/deploy.md](ops/deploy.md). The servers themselves aren't set up yet, so deploy steps are skipped until they are.*
| Environment | Purpose | Data |
|---|---|---|
| local | Development on a laptop: Docker Postgres (5433) and RustFS storage (9100, console 9101) | demo seed |
| staging | Release candidate, migrations rehearsed here first | demo seed + import tests |
| production | Customers | real; daily backups, monthly restore test |

Every variable is listed in `.env.example` and validated on start. Secrets never enter the repo.

## Build and quality gates
*Built in brick 1: pnpm workspace, Turborepo, strict TypeScript, Biome, Vitest and a CI workflow. Built in brick 2: CI runs Postgres and RustFS as service containers. Built in brick 4: CI checks migrations match the schema and apply cleanly. Built in brick 7: Playwright end-to-end tests on desktop and phone in CI, with the report kept on failure; since brick 16 they run against the production build. UX gates (accessibility scans, light and dark, desktop and phone, and speed budgets) added between bricks 7 and 8.*
- `pnpm check` (Biome lint + format), `pnpm typecheck` (strict TS), `pnpm test` (Vitest), `pnpm e2e` (Playwright, desktop and 375px mobile).
- Run before every commit: `pnpm check && pnpm typecheck && pnpm test`.
- CI (`.github/workflows/ci.yml`) runs the same gates on every pull request, with Postgres and RustFS as service containers (same images and ports as `docker-compose.yml`) a `pnpm db:status` step, a check that every schema change has a committed migration, and a migration run. End-to-end and accessibility tests run in a separate job, split in two halves side by side (`--shard`, each with its own services), so the suite stays inside the 25-minute limit as bricks add screens (brick 7). The test database is rebuilt and migrated before every run (only a database named `*_test`). From brick 5, tests cover organization isolation and property scoping through the real sign-in flow (`src/test/harness.ts`); no-overbooking concurrency arrives with reservations (`testing-patterns` skill).
