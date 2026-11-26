# 0018 · Permissions as data with per-group overrides; audit in the same transaction

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Decision 0008 set the principle (permission limits, approvals, audit events). Stage 0, brick 6 had to decide how it works in code.

## Decision
- **The default matrix is data** in `packages/shared/src/permissions.ts`, mirroring the DOMAIN.md table. Permissions are `module.action` keys. Some have a limit kind (`percent` or `amount_ngn`), with limits stored as decimal strings.
- **Organizations override per role and permission** in `permission_overrides`. No row means the default applies. The owner role can't be changed, and `permissions.manage` is owner-only by default.
- **One check per request:** `inOrganization` loads `access.rules`. Services call `requirePermission` or `requireWithinLimit`, and never compare against a role name or a constant.
- **Over the limit** answers 403 with `APPROVAL_REQUIRED`. Approval by a manager's PIN on the same device plugs into `requireWithinLimit` in brick 11.
- **Audit events** are written by `recordAudit(tx, access, …)` in the same transaction as the change, and are append-only by database trigger. Actor and subject ids carry no foreign keys and names are stored as snapshots, so history never depends on rows that may change later.
- **Better Auth's own member changes** (add, remove, change role) are audited through its organization hooks. Those hooks don't expose the actor, so these events show "Sign-in service".

## Consequences
- New modules add their permission keys to the matrix (and DOMAIN.md) and call the same helpers. A missing audit event fails a test, because every write's test asserts one.
- Until brick 7 adds Vento's own member-management screen and procedures, role changes made through Better Auth's endpoints are audited without the actor. When those procedures exist, they record the actor themselves, and Better Auth's role-change endpoint should be closed to direct use.
- Sign-in events wait for device sessions (brick 10), because a session has no organization until one is chosen.

## Alternatives considered
- **Hard-coded role checks in each module:** fast to write, impossible to change per hotel, easy to get inconsistent.
- **A full policy engine (e.g. Casbin, OPA):** more power than a 16-role matrix needs.
- **Audit by database triggers on every table:** captures rows but not intent, reason or approver.
- **Audit written after the transaction (event bus):** a crash between the two loses history.
