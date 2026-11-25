# 0001 · Monorepo and stack

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Vento Hotels has ten connected modules, a web app that must work offline, and money that must be exact. Types and validation must not drift between server and client, and the stack should match the sibling Vento Real Estate project so patterns carry over.

## Decision
One pnpm + Turborepo monorepo: `apps/web` (Vite, React 19, TanStack Router/Query/Table, shadcn/ui, Tailwind v4), `apps/api` (Hono + oRPC on Node 24), `packages/shared` (zod v4 schemas and oRPC contracts). PostgreSQL with Drizzle ORM and drizzle-kit migrations. Better Auth with organizations. Biome, Vitest, Playwright, GitHub Actions. pnpm only.

## Consequences
- One source of truth for types: a contract change breaks the web build at compile time.
- End-to-end type safety without code generation.
- Everyone works in one repo and runs the full check before committing.

## Alternatives considered
- Separate web and API repos: duplicated types and validation.
- Next.js full-stack: server components add complexity to an app that is almost all behind sign-in and must run offline as a SPA.
- tRPC: oRPC gives the same typing plus OpenAPI output for integrations.
- Prisma: Drizzle is closer to SQL, lighter, and better for `numeric` money and reporting queries.
