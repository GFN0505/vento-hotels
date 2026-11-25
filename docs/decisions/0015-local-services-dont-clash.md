# 0015 · Local services don't clash with other projects

- **Date:** 2026-11-25
- **Status:** accepted

## Context
The owner runs Vento Real Estate on the same Mac, with its local Postgres on port 5432. Running both projects must not mix databases or fail on a busy port.

## Decision
Vento Hotels' local services use their own Docker container names (prefixed `vento-hotels-`, e.g. `vento-hotels-postgres`) and their own ports. Local Postgres listens on **5433**. Other local services (e.g. the RustFS storage on 9100 and 9101, decision 0016) also pick ports that don't collide with the Real Estate project.

## Consequences
- `pnpm db:up` starts only this project's containers; `.env.example` points `DATABASE_URL` at port 5433.
- Both projects can run at the same time without stopping each other's databases.
- Any new local service must check for clashes before choosing a port.

## Alternatives considered
- Share one Postgres with separate databases: one project's reset or upgrade can break the other.
- Default port 5432: clashes with the Real Estate container.
