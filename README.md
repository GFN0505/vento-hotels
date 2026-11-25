# Vento Hotels

A hotel management platform for Nigerian hotel groups and chains. One place to run every property: selling rooms direct and on OTAs, the front desk, restaurant and bar, housekeeping and maintenance, stores, night audit, finance, payroll, and the owner's view across the group. It keeps working through power and internet cuts, and it makes revenue leakage visible to the owner the next morning.

> **Status:** building Stage 0 of the [release plan](docs/PRODUCT.md#release-plan). The product, domain and walkthrough docs are written and all 46 screens are designed.

## What's in v1
Ten modules, built in stages:

1. Reservations & Front Desk
2. Booking Engine & Channel Manager
3. Guests & Sales
4. Restaurant & Bar POS
5. Housekeeping & Maintenance
6. Inventory & Procurement
7. Finance
8. HR & Payroll
9. Guest App
10. Executive Analytics

They share some features that run across all of them: leakage and fraud controls, printing and shared-device PIN sign-in, data import from other systems, and a fixed set of reports.

## Documentation
| Document | What it covers |
|---|---|
| [docs/README.md](docs/README.md) | The documentation map and the definition of done for docs. Start here |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Vision, principles, personas, the ten modules, cross-cutting features, release plan |
| [docs/DOMAIN.md](docs/DOMAIN.md) | Vocabulary, statuses and rules, permissions matrix, reports catalogue, open questions |
| [docs/journeys/](docs/journeys/README.md) | Step-by-step user walkthroughs on the demo hotel group |
| [docs/design/claude-design-prompt.md](docs/design/claude-design-prompt.md) | Full design brief (46 screens) for a new Claude Design project |
| [docs/design/claude-design-update-prompt.md](docs/design/claude-design-update-prompt.md) | Update prompts for an existing Claude Design project |
| [docs/design/export/](docs/design/export/README.md) | Approved designs exported from Claude Design (all 46 screens, tokens) |
| [docs/design/screen-inventory.md](docs/design/screen-inventory.md) | Every screen the product needs, its status, and what will change |
| [docs/specs/](docs/specs/README.md) | Feature specs, written per release stage |
| [docs/decisions/](docs/decisions/README.md) | Decision records: why the big choices were made |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the code is laid out and how a request flows |
| [docs/help/](docs/help/README.md) | Help-centre articles for customers |
| [CHANGELOG.md](CHANGELOG.md) | What changed, in customers' words |
| [CLAUDE.md](CLAUDE.md) | Stack, commands, non-negotiables and code style for contributors and AI agents |

## Stack
pnpm + Turborepo monorepo (`apps/web`, `apps/api`, `packages/shared`). API on Hono + oRPC (Node 24) with zod v4 contracts, PostgreSQL + Drizzle, Better Auth with organizations, pg-boss for background jobs, S3-compatible storage. Web on Vite + React 19, TanStack Router/Query/Table, shadcn/ui + Tailwind v4, offline support through a service worker and IndexedDB. Biome, Vitest, Playwright, GitHub Actions. Full details in [CLAUDE.md](CLAUDE.md).

## Getting started
You need Node 24 (see `.nvmrc`), pnpm through corepack, and Docker Desktop running.

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm db:up        # Postgres and file storage in Docker, waits until healthy
pnpm db:status    # confirms both are reachable
pnpm check && pnpm typecheck && pnpm test
```

`pnpm db:down` stops the services; `pnpm db:reset` deletes their local data and starts fresh.

### Looking at the local database and files
- **Database:** open TablePlus, Postico or any Postgres app and connect to host `localhost`, port `5433`, user `vento_hotels`, password `vento_hotels`, database `vento_hotels` (tests use `vento_hotels_test`). These are local placeholder credentials, not secrets. From brick 4, `pnpm db:studio` opens Drizzle Studio in the browser.
- **Files:** open http://localhost:9101/rustfs/console/ and sign in with `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` from `.env`.

Once the rest of Stage 0 lands:

```bash
pnpm db:migrate && pnpm db:seed
pnpm dev
```

## How we work
Features go through specs → architecture plan → build → tests → review, with specialist AI agents for each step. They're defined in [`.claude/agents/`](.claude/agents/), and the step-by-step recipes are in [`.claude/skills/`](.claude/skills/). Before any commit: `pnpm check && pnpm typecheck && pnpm test`.

Secrets never go in this repository. It is public.
