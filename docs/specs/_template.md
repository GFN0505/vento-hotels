# <Feature name>

- **Status:** draft
- **Stage:** <0–6, from the release plan in `docs/PRODUCT.md`>
- **Module:** <one of: Reservations & Front Desk · Booking Engine & Channel Manager · Guests & Sales · Restaurant & Bar POS · Housekeeping & Maintenance · Inventory & Procurement · Finance · HR & Payroll · Guest App · Executive Analytics · Platform>
- **Walkthroughs:** <journey file and steps, e.g. `front-desk-morning.md` steps 4–9> (new or changed)
- **Screens:** <screen name and design number from `docs/design/screen-inventory.md`, e.g. Check-in and walk-in (#6)>
- **Decisions:** <`docs/decisions/NNNN-*.md`, if any>

## Problem
One paragraph, from the hotel staff's (or guest's) side.

## Persona and job
Who, what they're trying to get done, on which device, how often.

## Success looks like
Measurable outcomes: time, clicks, errors avoided, leakage made visible.

## User flow
Numbered steps for the main path, with the click count, using the demo world (Kora Victoria Island). Update the walkthrough to match.

## Acceptance criteria
Given / When / Then. Every heading below must be answered; write "Not relevant" if it truly isn't.

### Main path
- Given … when … then …

### Organization isolation
- A member of another organization can't read or change any of this data, even with a guessed id.

### Property scoping
- A member limited to one property can't see or act on another property's rooms, reservations, folios, outlets or stock. Group-level data (guests, companies, rates set once) behaves as described.

### Permissions, limits and approvals
- Which roles can do this (from the permissions matrix in `docs/DOMAIN.md`), the limit per role, what happens above the limit (approver PIN on the same device or approvals inbox), and that nobody approves their own action. Sensitive actions require a reason.

### Audit events
- Each event written: action name, before/after, reason, approver, device, business date.

### Leakage exceptions
- Which exceptions this feeds (discrepancy, rate override, void, comp, reprint, cash variance, short stay…) and how they appear in the owner's daily report.

### Offline behaviour
- What works offline on this screen, what is blocked, what the person sees, and how queued commands sync (idempotent, conflict rule).

### Business date
- Which business date charges, revenue and reports use; what changes after night audit closes the day.

### Tax lines
- VAT, state consumption tax and service charge lines from configuration; rounding; what the folio, receipt or invoice shows.

### Foreign currency
- Amounts in USD, GBP or EUR: rate, rate source and date stored; what NGN equivalent is shown and posted.

### Availability locking
- For anything that changes sellable rooms: row-level lock on room-type inventory per date, no overbooking beyond the configured limit, behaviour when two people book the last room.

### Empty, error and edge cases
- Empty states, validation errors, cancellations, part-payments, credit limit reached, closed business date, archived master data.

## Behind the scenes
- **Folio postings:** what is posted, reversed or transferred (append-only, corrections are reversals with a reason).
- **Night audit:** what the audit posts, checks or blocks on for this feature.
- **Ledger:** entries per entity and department (from Stage 5; before then, what the audit records so the ledger can be built from it).
- **Jobs:** pg-boss jobs (ARI push, messages, reports, scheduled checks), with retries and idempotency.
- **Notifications:** who is alerted, on which channel (in app, WhatsApp, SMS, email).

## UI copy
Buttons, empty states, errors, toasts, confirmations, approvals, guest messages (follow the `ux-writing` skill). Copy from the design board wins unless noted.

## Out of scope
What this deliberately doesn't do.

## Open questions
For the owner to decide. Must be empty before the status moves to `approved`.
