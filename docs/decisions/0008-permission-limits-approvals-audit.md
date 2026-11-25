# 0008 · Permission limits, approvals and audit events

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Revenue leakage (unapproved discounts, voids, comps, rooms sold off the books, missing cash) is the owner's biggest fear and the strongest reason to buy.

## Decision
Permissions are `module.action`, checked on the server, optionally limited to properties or entities. Limits (e.g. max discount %) are configuration per organization, seeded from the matrix in `docs/DOMAIN.md`. Sensitive actions need the permission and a reason; anything over a limit needs approval by someone with a higher limit (PIN on the same device or the approvals inbox), never oneself. Every write, sign-in and status change writes an append-only audit event (who, device, property, business date, before/after, reason, approver). Exceptions are generated from audit events and listed by name in the owner's daily report.

## Consequences
- UI hiding is cosmetic; tests cover limits, approvals and audit events for every sensitive action.
- Leakage controls (discrepancy check, blind counts, void and rate reports) read the same audit trail.
- Default limits and exception thresholds still need confirming with pilot hotels.

## Alternatives considered
- Role checks only, no limits: can't express "front desk can discount up to 10%".
- Approvals only through a separate workflow screen: too slow at the desk; same-device PIN keeps the guest waiting seconds, not minutes.
- Audit log as an add-on later: leakage controls would have no data.
