# Architecture

How the code is laid out and how a request flows through it. The *why* behind the big choices is in `docs/decisions/`. Keep this file current when the structure changes.

Each section says honestly where it stands: **Built in brick N** (on `main`), **In review (brick N)** (open pull request, not merged), or **Planned (brick N)** for the Stage 0 bricks: 1 monorepo skeleton, 2 local infra, 3 shared basics, 4 Drizzle and the API server, 5 auth, 6 permissions and audit, 7 web shell, 8 devices and PIN, 9 offline, 10 seed and deploy.

## Layout
*Built in brick 1 for the workspace, apps and packages; `api/src/infra/` built in brick 2. The `shared` files marked brick 3 are in review; everything else is planned for the bricks shown.*
```
apps/
  api/                       Hono + oRPC server on Node 24
    src/
      app.ts                 middleware chain, /health, /rpc                          (brick 4)
      env.ts                 zod-validated environment, fails fast on start           (brick 4)
      infra/                 settings reader (zod) and database/storage checks        (bricks 2–3)
      db/schema/             Drizzle tables, one file per module                      (brick 4)
      db/migrate.ts          applies migrations as a release step, never on app start (brick 4)
      middleware/            auth, organization, property scope, permission + limit   (bricks 5–6)
      audit/                 audit event writer                                       (brick 6)
      jobs/                  pg-boss workers and schedules                            (brick 10 / Stage 1)
      providers/             email, SMS, WhatsApp, payments, channel manager, storage (as needed)
      pdf/                   @react-pdf/renderer documents                            (Stage 1)
      modules/<module>/      <module>.service.ts, <module>.router.ts, tests next to them
    drizzle/                 generated SQL migrations, committed                      (brick 4)
  web/                       Vite + React 19 SPA
    src/
      routes/                TanStack Router file-based routes                        (brick 7)
      components/            shared UI on shadcn/ui + Tailwind v4 tokens               (brick 7)
      lib/orpc.ts            typed API client + TanStack Query                        (brick 7)
      offline/               service worker, IndexedDB outbox, sync queue             (brick 9)
    e2e/journeys/            one Playwright spec per walkthrough in docs/journeys      (brick 7)
packages/
  shared/                    the single source of API types
    src/
      money.ts               Decimal, toAmount, money maths, FX, formatMoney           (brick 3)
      ids.ts                 newId() UUID v7, idSchema                                 (brick 3)
      dates.ts               calendar dates, nights, property-time-zone date           (brick 3)
      pagination.ts          page query and { items, page, pageSize, total }           (brick 3)
      locale.ts              NGN default, supported currencies, Africa/Lagos           (brick 1)
      permissions/           module × action list and limit keys                     (brick 6)
      <module>/              zod schemas and the oRPC contract per module             (from brick 5)
```

## A request, end to end
*Planned (bricks 3–7).*
1. A screen calls the typed oRPC client. Its input and output types come from the contract in `packages/shared`, so a mismatch is a compile error.
2. The browser sends `POST /rpc/<module>/<procedure>`. Hono adds a request id and security headers.
3. oRPC validates the input against the zod schema, then runs the middleware in this order:
   1. **Auth:** Better Auth session, or a device session with a staff PIN on shared devices. No session, no request.
   2. **Organization:** the organization comes from the session, never from input. Every query filters by it.
   3. **Property scope:** the property in the request must be one the member is allowed; the property's business date is loaded into the context.
   4. **Permission and limit:** module × action from the permissions matrix. Above the member's limit, the request needs a valid approval (approver's PIN or approvals inbox), never the member's own. Sensitive actions need a reason.
4. The **handler** calls a service that does all its writes in one database transaction.
5. In the same transaction an **audit event** is written: who, device, property, business date, action, before/after, reason, approver.
6. The **response** is validated against the output schema and returned. One JSON log line per request with request id, organization id and property id, never guest personal data. Unexpected errors go to Sentry with the request id; the client sees a generic message.

## Offline path
*Planned (brick 9).*
- Front desk, POS and housekeeping run from a cached app shell and local data in IndexedDB.
- Each change offline becomes a **command** in an outbox with a client UUID v7 and an idempotency key, the device id and the time it happened.
- When the connection returns, commands are sent in order through the same middleware chain as any request. The server stores the idempotency key, so a resent command is applied once.
- Conflicts (room already taken, bill closed elsewhere) are resolved by the rules in the `offline-sync` skill and shown on the sync queue screen; nothing is silently dropped.
- Actions that need the server to be safe (a new booking that takes inventory, refunds, night audit) are blocked offline with a clear message.

## Local services
*In review (brick 2).*
- `docker-compose.yml` runs **Postgres 18** (`vento-hotels-postgres`, port 5433, databases `vento_hotels` and `vento_hotels_test`) and **RustFS** storage (`vento-hotels-storage`, API 9100, console 9101). Names, ports and volumes are unique to this project (decisions 0015, 0016).
- `pnpm db:up` starts both and waits until healthy, `pnpm db:down` stops them, `pnpm db:reset` deletes their data and starts fresh, `pnpm db:status` checks both are reachable.
- `apps/api/src/infra/` holds the reachability checks; their tests run against the real services locally (with `.env`) and in CI.

## Data
*Planned (brick 4 onwards).*
- **PostgreSQL** with Drizzle ORM; migrations generated by drizzle-kit and reviewed before applying (`db-migration` skill). Locally in Docker on port **5433** (brick 2).
- Every domain table has `organizationId`; operational tables also have `propertyId`. Both NOT NULL and indexed.
- **IDs** are UUID v7, generated on the server or, for offline commands, on the device.
- **Money** is `numeric(14,2)` with a currency code beside it; foreign amounts also store the FX rate, source and date. Calculated with a decimal library, never floats.
- **Folio postings and ledger entries are append-only.** Corrections are reversals with a reason. The ledger balances per entity.
- **Business date** is a `date` per property that only moves forward at night audit. Charges, revenue and reports use it, not the wall clock.
- **Availability locking:** booking, modifying, cancelling and channel ingest lock the room-type inventory rows for the dates (`SELECT … FOR UPDATE`) in one transaction. Overbooking only up to a configured limit.
- Statutory rates (VAT, consumption tax, service charge, payroll deductions) are versioned configuration with effective dates.

## Background jobs
*Planned (brick 10, used from Stage 1).*
pg-boss on the same Postgres, no Redis. Used for night audit steps, ARI pushes to the channel manager, payment and channel webhooks, guest messages, the owner's daily report, scheduled checks (room discrepancy, deposits due) and large imports. Every job is idempotent and retried with backoff; failures are visible to devops.

## Files and PDFs
*Local storage service in review (brick 2); file handling and PDFs planned (Stage 1).*
- **Files** go to S3-compatible storage: RustFS locally (brick 2, decision 0016), Cloudflare R2 in production. Access through signed URLs. Guest ID images sit in a private bucket with short-lived links.
- **PDFs** (registration cards, invoices, folios, statements, payslips, board packs) are rendered on the API with `@react-pdf/renderer`. Thermal receipts and kitchen tickets are 80mm browser print layouts (`printing` skill).

## Providers behind interfaces
*Planned (as each stage needs them).*
Every outside service sits behind an interface in `apps/api/src/providers/` with a fake for tests and local work: `EmailProvider`, `SmsProvider`, `WhatsAppProvider`, `PaymentProvider` (Paystack), `ChannelProvider` (one certified channel manager), `StorageProvider`. Which provider to use is an open question in `docs/DOMAIN.md` until decided in `docs/decisions/`.

## Environments
*Planned (brick 10). Hosting is undecided.*
| Environment | Purpose | Data |
|---|---|---|
| local | Development on a laptop: Docker Postgres (5433) and RustFS storage (9100, console 9101) | demo seed |
| preview | One per pull request, for design and product review | demo seed |
| staging | Release candidate, migrations rehearsed here first | demo seed + import tests |
| production | Customers | real; daily backups, monthly restore test |

Every variable is listed in `.env.example` and validated on start. Secrets never enter the repo.

## Build and quality gates
*Built in brick 1: pnpm workspace, Turborepo, strict TypeScript, Biome, Vitest and a CI workflow. In review (brick 2): CI runs Postgres and RustFS as service containers. Playwright planned (brick 7).*
- `pnpm check` (Biome lint + format), `pnpm typecheck` (strict TS), `pnpm test` (Vitest), `pnpm e2e` (Playwright, desktop and 375px mobile).
- Run before every commit: `pnpm check && pnpm typecheck && pnpm test`.
- CI (`.github/workflows/ci.yml`) runs the same gates on every pull request, with Postgres and RustFS as service containers (same images and ports as `docker-compose.yml`) and a `pnpm db:status` step. From brick 4, tests cover organization isolation, property scoping and no-overbooking concurrency (`testing-patterns` skill).
