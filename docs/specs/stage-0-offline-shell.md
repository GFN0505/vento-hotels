# Offline shell

- **Status:** built (brick 16)
- **Stage:** 0
- **Module:** Platform
- **Walkthroughs:** `waiter-dinner-service.md` (the power cut), `front-desk-morning.md`
- **Screens:** offline state on every screen (design system; #24 error and access states)
- **Decisions:** `docs/decisions/0009-offline-first-operations.md`, `docs/decisions/0024-offline-shell-first.md`

## Problem
Power and internet cuts are routine. Today, if the connection drops, reloading Vento shows the browser's error page and staff lose their place.

## Persona and job
- **Anyone on a device they've used before** (during a cut): open Vento, see where they were, know they're offline and that changes wait for the connection.

## User flow
1. Chiamaka is on Home at the front desk. The internet drops.
2. A banner appears under the top bar: "You're offline. Showing what was saved on this device at 10:42. Changes need a connection for now; this clears by itself when you're back."
3. She reloads, or the PC restarts after a power cut. Vento opens on Home with the saved data and the banner.
4. The connection returns; the banner goes, and the data refreshes.

## Acceptance criteria

### Main path
- After one visit online, the app opens with no connection (service worker), on the pages people had, with the data last seen and the banner.
- Offline is detected from the browser and from requests that never reach Vento (Wi-Fi without internet); any answer from Vento clears it.
- A new version waits for **Reload** in a toast; the first install is silent.

### Organization isolation
- Saved data is what the signed-in person already saw from their group; it's cleared on sign-out.

### Property scoping
- Saved data covers only hotels the person can access (it's the API's own scoped answers).

### Permissions, limits and approvals
- Nothing changes offline in Stage 0; every change still goes to the server, which checks it as before.

### Audit events
- Not relevant: nothing is written offline yet.

### Leakage exceptions, offline behaviour, business date, tax lines, foreign currency, availability locking
- Offline: as above. The rest arrive with the outbox and the first offline command (decision 0024).

### Empty, error and edge cases
- First visit with no connection: the browser's own offline page (nothing is on the device yet).
- Signing out, or locking a shared device, removes the remembered person and saved data, so the next person can't open the app as them.
- Storage blocked (private mode): the app works online as before.

## Behind the scenes
- `apps/web/sw/`: the service worker and the Vite step that lists the built files to keep. `apps/web/src/offline/`: connection state, saved data (IndexedDB), registration and update prompt.
- Kept queries: `organization.current`, `organization.home`, `properties.list`. Modules that must work offline add theirs.
- Browser tests run against the production build (`e2e/offline.spec.ts`).

## Out of scope
- The outbox, sync endpoint, idempotency keys, offline PIN sign-in, sync queue screen: with the first offline command.
