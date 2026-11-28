# 0029 · The front desk PC keeps today's and tomorrow's lists through PIN locks

- **Date:** 2026-11-28
- **Status:** accepted (supersedes the lock rule of 0024)

## Context
Decision 0024 clears everything the app saved on the device when someone signs out **or a shared device locks**. Front desk PCs are shared PIN devices with a 5-minute idle lock (decision 0022), so the offline copy of the arrivals list would be wiped every few minutes, and offline check-in of an assigned arrival (decision 0009's allow-list, brick 8) would have nothing to work from exactly when the power or internet goes. The owner answered the front desk spec's open question 2 on 28 Nov 2026: the front desk PC is shared, with PIN sign-in and the idle lock, and the day's lists stay on it.

## Decision
- On a **registered shared device**, the Front desk lists for **today and tomorrow** of the device's hotel stay on the device through **PIN locks and person switches**. They hold names, booking numbers, rooms and room types, nationality, party, readiness and notes; never phone, email, address, ID numbers or ID images.
- They are cleared on a **full sign-out** (Sign out in the account menu), when the **device is revoked**, and when the **business date moves on** (the saved copy is for a business date; a newer one replaces it and an older one is dropped).
- Everything else follows 0024 unchanged: on a lock, the person's session, the remembered sign-in and the other saved pages are cleared, and the next page load starts from the lock screen.
- Queued check-ins (the outbox, its own IndexedDB database) keep the typed ID numbers and the ID photo **encrypted on the device** (WebCrypto AES-GCM, a non-extractable key kept in IndexedDB) until the server answers them; then they are deleted.
- A check-in sheet left open when the PC locks is discarded with what was typed; the arrival stays on the list.

## Consequences
- Offline check-in works on a desk PC through a power cut, whoever signs in with their PIN.
- Someone who can unlock the PC with any staff PIN can read today's names and room numbers: about what the paper arrivals list on the counter shows today.
- `apps/web/src/offline/saved-data.ts` keeps the desk lists in their own key, and `lockDevice` keeps that key; any new kept query must say whether it survives a lock.

## Alternatives considered
- Keep 0024's clear-on-lock: offline check-in would be useless on the device that needs it most.
- Keep everything through locks: the next person would see the previous person's other pages, and more personal data would stay than the desk needs.
- Encrypt the lists with a key derived from the PIN: every PIN unlocks it, so it would protect nothing the PIN lock doesn't, at the cost of complexity.
