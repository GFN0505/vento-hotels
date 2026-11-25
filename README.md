# Vento Hotels

A hotel management platform for Nigerian hotel groups and chains. One place to run every property: selling rooms direct and on OTAs, the front desk, restaurant and bar, housekeeping and maintenance, stores, night audit, finance, payroll, and the owner's view across the group. It keeps working through power and internet cuts, and it makes revenue leakage visible to the owner the next morning.

> **Status:** planning. The product, domain and design docs are written; no application code yet. Building starts with Stage 0 of the [release plan](docs/PRODUCT.md#release-plan).

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
| [docs/PRODUCT.md](docs/PRODUCT.md) | Vision, principles, personas, the ten modules, cross-cutting features, release plan |
| [docs/DOMAIN.md](docs/DOMAIN.md) | Vocabulary, statuses and rules, permissions matrix, reports catalogue, open questions |
| [docs/journeys/](docs/journeys/README.md) | Step-by-step user walkthroughs on the demo hotel group |
| [docs/design/claude-design-prompt.md](docs/design/claude-design-prompt.md) | Full design brief (46 screens) for a new Claude Design project |
| [docs/design/claude-design-update-prompt.md](docs/design/claude-design-update-prompt.md) | Update prompts for an existing Claude Design project |
| [docs/design/screen-inventory.md](docs/design/screen-inventory.md) | Every screen the product needs, its status, and what will change |
| [docs/specs/](docs/specs/) | Feature specs, written per release stage |
| [CLAUDE.md](CLAUDE.md) | Stack, commands, non-negotiables and code style for contributors and AI agents |

## Stack
pnpm + Turborepo monorepo (`apps/web`, `apps/api`, `packages/shared`). API on Hono + oRPC (Node 24) with zod v4 contracts, PostgreSQL + Drizzle, Better Auth with organizations, pg-boss for background jobs, S3-compatible storage. Web on Vite + React 19, TanStack Router/Query/Table, shadcn/ui + Tailwind v4, offline support through a service worker and IndexedDB. Biome, Vitest, Playwright, GitHub Actions. Full details in [CLAUDE.md](CLAUDE.md).

## Getting started
Not runnable yet. Once Stage 0 lands:

```bash
pnpm install
cp .env.example .env
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev
```

## How we work
Features go through specs → architecture plan → build → tests → review, with specialist AI agents for each step. They're defined in [`.claude/agents/`](.claude/agents/), and the step-by-step recipes are in [`.claude/skills/`](.claude/skills/). Before any commit: `pnpm check && pnpm typecheck && pnpm test`.

Secrets never go in this repository. It is public.
