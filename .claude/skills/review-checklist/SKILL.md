---
name: review-checklist
description: The project's code-review checklist — organization isolation and property scoping, authorization with reason-required sensitive actions, server-side permission limits and approvals, audit events on every write, money and folio correctness (append-only postings, tax lines, business date), availability locking and no overbooking, idempotency for offline sync and webhooks, security (OWASP), performance, conventions, with grep commands to find common violations. Use when reviewing a diff or auditing code.
---

# Review checklist

Start with `git diff main...HEAD --stat`, then read each changed file **and** its callers.

## 1. Organization isolation and property scoping (critical)
- Every Drizzle query on a domain table includes `organizationId` from `context`, never from `input`.
  `rg -n "db\.(select|update|delete)|\.from\(|\.update\(|\.delete\(" apps/api/src/modules` and check each one.
  `rg -n "input\.organizationId" apps/api/src` should return nothing.
- Operational queries (rooms, reservations, stays, folios, POS checks, housekeeping, stock) also filter by `propertyId`, and the member's allowed properties are enforced on the server (list endpoints included, not just get-by-id).
- Inserts set `organizationId` from context, and referenced ids (propertyId, roomId, folioId, guestId, companyId, outletId, entityId, …) are confirmed to belong to the same organization **and** an allowed property.
- Cross-property actions (transfer between stores, group-wide guest profile, routing to a company folio) check permission on both sides.
- Lookups by id return `NOT_FOUND` (not `FORBIDDEN`) for another organization's or a disallowed property's row, so ids can't be probed.
- Records that belong to an entity (ledger entries, bank accounts, payroll, invoices) carry the right `entityId`.
- Guest app and booking engine (public) procedures are scoped by a signed token or the property slug, never by an id the caller can change. ID scans and invoices use signed, expiring URLs.

## 2. Authorization
- Every procedure uses `authed` plus `requirePermission(module, action)`. Public procedures (booking engine, guest app, webhooks) are explicit and reviewed.
- **Sensitive actions** (rate override, discount, void, refund, comp, room move after audit, post-audit correction, blacklist, overbooking beyond the limit, viewing full ID numbers) check the permission **and** require a non-empty reason in the contract, and write an audit record (who, when, what, reason, before/after).
  `rg -n "void|refund|comp|discount|override" packages/shared/src --type ts` and confirm each contract has `reason: z.string().min(...)`.
- Role changes and invites can't raise a member above the inviter's own role or beyond their properties.
- **Permission limits are checked on the server** from the organization's permissions-matrix configuration (max discount %, refund amount, credit-limit override), never from a constant or a value sent by the client.
  `rg -n "maxDiscount|discountLimit|refundLimit|limitPercent" apps/web/src` should not be where a limit is decided; `rg -n "(<=?|>=?)\s*(10|25|50|100000)\b" apps/api/src/modules` near discount or refund code means a hard-coded limit.
- Over-limit actions require an approver with a higher limit, verified on the server (password or PIN), and **the approver is never the actor**. The approver id lands on the audit event.
- PIN sign-in is accepted only from a registered, non-revoked device bound to the property.

## 2a. Audit events
- Every write (create, change, void, discount, override, room status change, sign-in, import) writes an audit event — actor, device, property, business date, action, entity, before/after, reason, approver — **in the same transaction** as the change.
  List the service functions that write: `rg -n "\.insert\(|\.update\(|\.delete\(" apps/api/src/modules -l`, then for each file `rg -n "audit\(|recordAudit|writeAuditEvent" <file>`; a writing service with no audit call is a finding.
- The audit table is append-only: `rg -n "update\(auditEvents|delete\(auditEvents" apps/api/src` should return nothing.
- Actions listed as exceptions in `docs/DOMAIN.md` (rate below plan, override, discount, comp, void, refund, quick turn, cash variance, unmatched payment, POS void after send, stock variance) are reachable by the exception query that feeds the owner's daily report.

## 3. Money, folios and dates
- No `number` maths on money. `rg -n "parseFloat|Number\(|Math\.round|toFixed\(" apps/api/src apps/web/src` near amount fields.
- Rounding happens once, at the end, half-up to 2 dp. Totals equal the sum of their lines (including tax lines).
- **Postings are append-only.** `rg -n "update\((folioPostings|postings|ledgerEntries)|delete\((folioPostings|postings|ledgerEntries)" apps/api/src` should return nothing. Corrections are reversal postings linked to the original, with reason and user.
- Folio balance is derived from postings, never stored as an editable field or set by hand.
- Each charge stores its **tax lines** (code, rate, base, amount, rule id) at posting time. Nothing recomputes tax on existing postings. Rates come from `statutory_rules` by effective date and state, never constants: `rg -n "0\.075|7\.5|0\.05\b|0\.1\b" apps/api/src/modules` and check each hit.
- Charges, revenue and reports use the property's **business date**, not `new Date()`. `rg -n "new Date\(\)|Date\.now\(\)" apps/api/src/modules` and check none decide a business date. Post-audit dates are closed.
- Stay, business and due dates are `date`, not `timestamptz`, in the property's time zone.
- Foreign-currency amounts carry currency, FX rate, rate source and rate date (and the NGN equivalent). No conversion with an unrecorded rate.
- Ledger entries balance per entry and entity; night audit is idempotent per property and business date.
- Check-out is blocked with an unsettled balance unless transferred to the city ledger. Post-to-room checks the guest is in-house, the "no post" flag and the credit limit.

## 4. Availability and overbooking
- Every change to availability (book, modify dates/room type, cancel, no-show, OOO, group block, channel ingest) runs in one transaction that locks the room-type inventory rows for each date **in date order** (`SELECT … FOR UPDATE`) to avoid deadlocks.
  `rg -n "forUpdate|FOR UPDATE" apps/api/src/modules` and confirm every availability writer is covered.
- Availability is checked after the lock, not before it. Overbooking beyond the configured limit is rejected; within the limit it's explicit and alerted.
- Changes trigger an ARI push (see the `channel-manager` skill). Tests cover two concurrent bookings for the last room.

## 5. Idempotency
- Writes that can come from offline devices carry a client UUID v7 and an idempotency key; a replay returns the original result and creates nothing new (unique constraint plus service check). See the `offline-sync` skill.
- Webhooks (Paystack, channel manager) store the raw event first, are unique on provider + reference + event, and verify before recording.
- Background jobs run on pg-boss and are safe to retry; once-per-date work (night audit, owner's daily report, discrepancy checks) uses a singleton key.

## 6. Security (OWASP Top 10)
- All input is validated by a zod contract. No raw `sql` with interpolated user input (use `sql` placeholders).
- No secrets, tokens or `.env` values in code, logs or error messages. The repo is **public**.
- No card data anywhere (`rg -n -i "cardNumber|pan\b|cvv|cvc" apps packages`). Provider tokens only.
- Guest personal data (ID numbers, passport, phone) not in logs or analytics; ID numbers encrypted at rest and masked in responses unless the caller has the permission.
- Webhook signatures checked on the raw body with a timing-safe compare.
- No `dangerouslySetInnerHTML` without sanitizing.
- Uploads (ID scans, invoices, photos, import files): type and size limits, content-type checked, private storage with short-lived signed URLs. Import files: formulas treated as text, rows validated with the shared zod schemas, deleted after the undo window.
- Email, SMS and WhatsApp only through `EmailProvider` / `SmsProvider` / `WhatsAppProvider`: `rg -n "from '(resend|twilio|termii)" apps/api/src/modules` should return nothing.
- Logs use pino with request, organization and property ids; no guest personal data, PINs or tokens in log or Sentry payloads.
- Auth: rate limits on login, reset, invite, guest app links, booking engine checkout and post-to-room PIN.
- New dependencies are maintained and needed.

## 7. Data integrity
- Multi-table writes are in a transaction. Invariants are also enforced in the DB (unique, check, FK), e.g. one stay per room per night (exclusion or unique on room × date), one open cashier shift per cashier, unique channel reference per channel.
- Status changes follow the allowed transitions in `docs/DOMAIN.md`.
- Deleting master data with history is blocked (archive instead).

## 8. Performance
- No N+1: no queries inside loops (tape chart and night audit are the usual suspects). Use joins or `inArray`.
- Lists are paginated on the server; filtered and sorted columns are indexed (`organizationId, propertyId, …` composite indexes).
- Web: no request waterfalls (use route loaders), no fetching in `useEffect`, large lists and the tape chart virtualized, images sized and lazy-loaded. POS and housekeeping screens stay fast on a mid-range Android phone.

## 9. Conventions
- Types imported from `packages/shared`, not redeclared.
- shadcn components only, design tokens only, no hex. Works in dark mode and at 375px.
- No `any`, no unused code, no stray `console.log`.
- Names match `docs/DOMAIN.md`.

## 10. Tests
Changed behaviour has tests, including a cross-organization and cross-property access test for new resources, a concurrency test for availability writers, a replay test for idempotent endpoints, permission-limit and approval tests (at, over, self-approval) for limited actions, and an audit-event assertion for each write. New modules extend `pnpm db:seed`.

## Reporting
Only report what you verified in the code. For each finding: severity, `path:line`, the problem, a concrete failure scenario, and the fix.
