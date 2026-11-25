# Permissions, limits and the audit log

- **Status:** built (brick 6, in review)
- **Stage:** 0
- **Module:** Platform
- **Walkthroughs:** `front-desk-morning.md` (discount over front desk's limit), `owner-morning.md` (who did what), `going-live.md` (permission defaults left as they are)
- **Screens:** Permissions and limits (#26, API only in this brick), Audit log (#28, API only), approval prompt (#22, brick 9)
- **Decisions:** `docs/decisions/0008-permission-limits-approvals-audit.md`, `docs/decisions/0018-permissions-and-audit-in-practice.md`

## Problem
Owners need to trust that staff can only do what their role allows, that limits (discount %, refund amount) are enforced, and that every change can be traced to a person. Without this, leakage controls have nothing to stand on.

## Persona and job
The owner sets who may do what (rarely, during setup and after incidents). GMs and finance read the audit log when something looks wrong. Everyone else just meets a clear "you don't have access" or "over your limit" when they hit a boundary.

## Success looks like
- Every permission check happens on the server from one matrix, with no role names hard-coded in modules.
- Every change writes exactly one audit event in the same transaction, and history can't be edited, even with direct SQL.

## Acceptance criteria

### Main path
- The default matrix in `packages/shared/src/permissions.ts` matches the DOMAIN.md table, and a test pins the seed limits.
- The owner can view the effective matrix and change any role's rule except the owner role, with a reason. The change applies to their group only.

### Organization isolation
- Overrides and audit events belong to one organization. Another group never sees them and is never affected by them.

### Property scoping
- A member limited to some properties sees only audit events at those properties. Group-level events (setup, permissions) are for members who see every property.

### Permissions, limits and approvals
- `requirePermission(access, key)`: 403 "You don't have access to this".
- `requireWithinLimit(access, key, value)`: at the limit is allowed. Above it returns 403 with `data.code = 'APPROVAL_REQUIRED'`, the limit and the value. Approval by a manager's PIN arrives in brick 9.
- `permissions.manage` is owner-only by default, so a group admin can't widen their own access.

### Audit events
- `entity.created`, `property.created`, `member.property_access_changed` and `permission.changed` record the actor, before and after, and the reason where one applies.
- `member.added`, `member.removed` and `member.role_changed` (from Better Auth's hooks) record the subject and the change, with the actor shown as "Sign-in service".
- A failed change writes no audit event. Audit rows refuse UPDATE and DELETE in the database (SQLSTATE 23001).

### Leakage exceptions, offline, business date, tax lines, foreign currency, availability locking
Not relevant yet. The audit event has `businessDate`, `deviceId` and `approverMemberId` columns ready for the modules that fill them.

## Behind the scenes
- Effective rules = default matrix + the organization's `permission_overrides`, loaded once per request into `access.rules`.
- `recordAudit(tx, access, event)` writes in the caller's transaction.

## Out of scope
Approval by PIN and the approvals inbox (brick 9 and Stage 1), screens (brick 7), sign-in events (brick 9, with device sessions), and the exceptions feed for the owner's daily report (Stage 1).

## Open questions
None.
