---
name: pre-commit-check
description: Run the full quality gate (Biome, typecheck, tests, secret scan) and fix failures before committing. Use before every commit or when asked to check the work is ready.
---

# Pre-commit check

Run in order, fix and re-run until each one passes:

1. `pnpm check` — Biome lint + format. Run `pnpm check --write` to auto-fix, then review what changed.
2. `pnpm typecheck` — fix the types properly. No `any`, no `@ts-ignore`.
3. `pnpm test` — if a test fails, decide whether the code or the test is wrong. Never delete or skip a test just to pass.
4. If the DB schema changed: confirm a migration was generated and that it's in the diff.
5. If the change touches offline sync, the booking engine, POS or front desk flows: run `pnpm e2e` for the affected journeys (including the offline ones).
6. Secret scan (the repo is public):
   `git diff --cached | rg -i "(api[_-]?key|secret|password|token|PRIVATE KEY|DATABASE_URL=|sk_live_|pk_live_|sk_test_)"`. Anything real goes to `.env` and the key name goes to `.env.example`.
7. Personal data scan: no real guest names, phone numbers, passport or ID numbers in fixtures, seeds or screenshots. Use obviously fake data.
8. `git status` — no stray files (`.env`, dumps, screenshots, `node_modules`, Playwright reports).

Report each step's result. Only say the work is ready when all of them pass. If something couldn't be run, say so.
