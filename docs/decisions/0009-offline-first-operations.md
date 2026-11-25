# 0009 · Offline-first front desk, POS and housekeeping

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Power and internet cuts are routine. A restaurant can't stop taking orders and a front desk can't stop checking in arrivals when the connection drops.

## Decision
Front desk, POS and housekeeping work offline. A service worker caches the app shell and the reference data each device needs. Writes go into an IndexedDB outbox as commands (intents, not state) with a client UUID v7 and an idempotency key, and sync in order when back online. The server stays the source of truth and wins on availability and folio balances. Offline-allowed commands are an explicit allow-list: e.g. POS orders, payments with reference, voids with permission, check-in of already-assigned arrivals, room status changes. Blocked offline: new bookings and changes that need live availability, night audit, rate changes, shift close, and post to room or credit beyond what the cache can confirm.

## Consequences
- Every endpoint an offline device can call is idempotent per `(organizationId, idempotencyKey)`.
- Shared devices are registered to a property, use PIN sign-in that works offline, and can be revoked.
- Conflicts go to a person; postings for a closed business date are flagged for the auditor.
- Whether kitchen displays need a local bridge offline is still open in `docs/DOMAIN.md`.

## Alternatives considered
- Online only: unusable during outages, which is when leakage happens.
- Syncing state instead of commands: conflicts become silent overwrites.
- A native app with a local database: slower to ship and update; a web app installs from a link.
