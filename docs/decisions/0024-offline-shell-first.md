# 0024 · The offline shell ships in Stage 0; the outbox ships with the first offline command

- **Date:** 2026-11-26
- **Status:** accepted

## Context
Decision 0009 makes front desk, POS and housekeeping work offline: a service worker keeps the app on the device, reference data is cached, and writes go into an IndexedDB outbox synced with idempotency keys. Stage 0 has no module that writes anything offline yet (setup, team, permissions and two-step are deliberately online-only), so an outbox now would have no commands to carry.

## Decision
- **Now (Stage 0):** a hand-written service worker (`apps/web/sw/`) keeps the built app on the device: pages network-first with the kept app as fallback, built files cache-first, never `/api`, `/rpc` or `/health`. A new version waits until the person taps **Reload**.
- The app saves the reference data people last saw (`organization.current`, `organization.home`, `properties.list`) in IndexedDB and restores it before the first render. Pages open offline with it, and the banner says when it was saved. Only an allow-list is kept, never guest records or ID numbers.
- Who was signed in is remembered (name, email, ids) so the app opens offline. Signing out, or locking a shared device, clears all of it.
- "Offline" means the browser says so **or** a request never reached Vento (Wi-Fi without internet). Any answer from Vento brings it back.
- **Later:** the outbox, the sync endpoint, the `idempotency_keys` table, offline PIN sign-in and cached PIN hashes ship with the first offline command (Stage 1 check-in of assigned arrivals, then housekeeping and POS), following the `offline-sync` skill.
- Browser tests run against the production build, where the service worker lives.

## Consequences
- Everyone gets a usable app through cuts now: they can see where they were, and they're told plainly that changes need a connection.
- No library: the service worker is ~60 lines and adds nothing to the first download (the registration loads after the page).
- Offline-capable modules must add their reference queries to the kept list in `apps/web/src/offline/saved-data.ts`, and their commands to the outbox when it ships.

## Alternatives considered
- Workbox or vite-plugin-pwa: more than we need and harder to read; would grow the build.
- Building the outbox now with a test-only command: machinery with no real user, likely to be reshaped by the first real command.
