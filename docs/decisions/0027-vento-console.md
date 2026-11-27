# 0027 · The Vento console is a separate staff area in Stage 1, behind required two-step

- **Date:** 2026-11-27
- **Status:** accepted (owner, 2026-11-27, with `docs/specs/stage-1-vento-console.md`). Supersedes the "Who switches" bullet of 0021; amends 0023 for Vento staff; moves the support console out of Stage 6 in `docs/PRODUCT.md`.

## Context
0021 had the Vento team switch modules with `pnpm features` on the server, attributed only as "Vento team", with a support console "later (Stage 6)". The first pilot needs `front_desk` switched on, a trial tracked, failed emails found and an onboarding specialist able to see what the hotel sees, all before going live in Stage 1. Vento Real Estate built a console for the same jobs (its decision 0021), which we reuse minus releases, plans, AI and passkeys.

## Decision
- **Brick 5b of Stage 1:** a lean Vento console at `/console` on the same origin (0019): groups and their hotels, feature switches, trials, failed pg-boss jobs, read-only support views and an append-only platform activity trail. Subscription billing stays in Stage 6.
- **Separate staff accounts.** Staff join by staff invitation (the first by `pnpm staff invite --bootstrap`), belong to no group, and land on the console. Two-step (authenticator app, 0023) is required for them and can't be turned off; opening the console needs a code proven in the last 5 minutes, and the console window closes after 15 minutes idle or 8 hours.
- **Kept apart from customers.** Own route tree, contract subpath and router chain; NOT_FOUND to anyone who isn't active staff; customers never download console code. `staff_accounts` and `platform_audit_events` are the only tables without `organizationId`, by design.
- **Same switches, same audit.** The console calls the same `switchFeature` operation and writes the same group audit event as the command, plus a platform event naming the staff member. `pnpm features` switching becomes break-glass (`--break-glass`, every other staff member emailed); listing stays open.
- **Trials** start at sign-up for 30 days; Vento can change the end date. Before billing, nothing stops when a trial ends.
- **Support access** is given only by the group owner with their PIN, for chosen hotels, for 1 hour, 24 hours or 3 days, with a reason. The support view is **read only**: every customer procedure declares read or write, and writes are refused on the server in a support view. Owners see the staff member's first name and every page opened.

## Consequences
- Every Vento change is tied to a real two-step sign-in; the command line can't quietly impersonate staff.
- Every customer procedure from now on must declare read or write; a walk test fails otherwise.
- Jobs that belong to a group carry its `organizationId`, and failed jobs stay listed for 24 hours without their contents.
- "Read and fix" support needs its own decision and security review.

## Alternatives considered
- **Keep the console in Stage 6:** the pilot would go live run from a server terminal, with no support view.
- **Staff as normal accounts with a flag:** mixes Vento power with hotel membership.
- **A separate admin host:** a second deploy and origin for a handful of staff.
- **Read and fix now:** support's changes would land in the hotel's books under Vento's name before approvals and limits for support exist.
