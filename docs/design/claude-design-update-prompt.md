# Claude Design update prompts

Use these in the **existing** Vento Hotels project in Claude Design, after the first screens (1–19) are designed. They add to the design rather than starting over. The full prompt in `claude-design-prompt.md` is only for starting a new project from scratch.

Paste one block at a time, in order, and review each before the next:

- **Update 1:** changes to the existing screens and design system. Always do this first.
- **Update 2:** screens 20–23. Skip if you already designed them.
- **Update 3:** screens 24–29, setup and admin.
- **Update 4:** screens 30–36, front desk working screens.
- **Update 5:** screens 37–46, operations support.

Each block repeats the rules that matter, so it works even if Claude Design has lost earlier context.

---

## Update 1: changes to existing screens

```
We're continuing the Vento Hotels design. Keep the existing design system, layouts and screens exactly as they are; don't restyle or rebuild anything that isn't listed below. Make only these changes, and show each changed screen before and after.

Design system additions (add to the design system page, same tokens and style):
- PIN pad (staff avatars + 4–6 digit pad, large touch targets)
- Approval prompt (inside an existing dialog: "This is above your limit. A manager can approve with their PIN." + manager picker + PIN)
- Exception row (type, amount, staff, reason, approver, time) — factual, never accusatory; no words like "fraud" or "caught"
- Audit event row (who, when, device, before → after, reason, approver) and an audit trail drawer
- Permissions grid cell (allowed / limit / approver)
- Effective-dated rule row (current, scheduled, past)
- Approval card (for the approvals inbox)
- Report layout (filters, totals, table, export)
- Print layouts: A4 and 80mm thermal

Changes to existing screens:
1. Top bar (all screens): add an approvals count next to notifications.
2. Group executive home (#1) and Property GM home (#2): add a compact "Exceptions" card (yesterday's count by type: discounts, voids, refunds, cash variance, room discrepancies) linking to the Leakage screen.
3. Reservation detail (#5), Folio (#7), POS (#11): every sensitive action (rate override, discount, void, refund, comp, room move after audit) asks for a reason in the same dialog. If the amount is above the user's limit, the same dialog shows the approval prompt instead of an error.
4. Folio (#7), reservation detail (#5), room tile (#12): add an entry point to the audit trail drawer.
5. POS (#11): staff sign in with the PIN pad on the shared tablet; a void after the ticket was sent needs manager approval.
6. Housekeeping attendant view (#12): add a "Room check" task — walk the floor and mark each room occupied or vacant.
7. Finance (#15): cashier shift close becomes a blind count — the cashier enters counted cash per method first; the expected total and variance appear only after submitting. The night audit wizard's last step shows "Owner's daily report sent" with recipients.
8. Any sample corporate names: use made-up companies (e.g. "Acme Energy Ltd"), never real Nigerian companies.
```

## Update 2: screens 20–23 (skip if already designed)

```
Continue the Vento Hotels design using the existing design system. Add these new screens without changing existing ones. Desktop 1440px and mobile 390px, light and dark, with loading, empty, error and offline states.

20. Owner's daily report and leakage view: the one-page morning report as it arrives on WhatsApp (image or PDF) and email — occupancy, revenue, cash collected, then exceptions with staff names (rates below plan, discounts, voids, comps, refunds, quick turns, cash variances, room discrepancies). In the app, a Leakage screen: exceptions by type and by staff member over time, each drilling down to the audit trail (who, device, reason, approver). Room discrepancies ("sleeper": system says occupied, room found empty; "skipper": system says vacant, room was used) open as alerts that must be resolved with a reason. This is the owner's reason to buy: calm, factual, never accusatory.
21. Printed documents: A4 registration card (with foreign national section and guest signature box), A4 invoice / folio with tax lines (VAT, consumption tax, service charge) and bank details, 80mm thermal receipt, 80mm kitchen/bar ticket (large item text, modifiers, table, time, server), and a city ledger statement. Designed for black-and-white printing.
22. Shared device sign-in: POS tablet and housekeeping phone lock screen with staff avatars and a PIN pad, auto sign-out, quick user switch mid-shift, manager PIN approval for an over-limit action (e.g. a discount above the waiter's limit) on the same device, and device registration for a property.
23. Data import: pick what to import (rooms, guests, corporates, future reservations, opening balances, stock, employees), download template, upload, row-by-row validation errors, preview, apply, and undo within 24 hours.
```

## Update 3: setup and admin (24–29)

```
Continue the Vento Hotels design using the existing design system. Add these new screens without changing existing ones. Desktop 1440px and mobile 390px, light and dark, with loading, empty, error and offline states. These are setup screens: keep them plain, fast and easy to scan.

24. Sign in and access states: sign in, 2FA, forgot password, accept invite; and the states around them: no property assigned, device not registered, session expired, no access to this page, page not found, first load while offline.
25. Settings: one settings area with property settings (logo, address, time zone, check-in/out times, current business date, owning entity), entities and departments, members and roles (invite, assign roles, limit to properties or entities), and devices (register, name, bind to a property, revoke).
26. Permissions and limits: roles × actions grid with limits in the cells (e.g. front desk discount ≤ 10%, refund ≤ ₦100,000), who can approve above each limit, owner only, with every change shown in the audit trail. Must stay readable with 16 roles and ~20 actions.
27. Taxes, charges and payments setup: VAT, state consumption tax and service charge as rules with effective dates (current, scheduled, past), what each applies to, and inclusive/exclusive defaults; payment methods, bank accounts and POS terminals, each mapped to a ledger account.
28. Audit log: filter by staff, action, property, device and date; each event shows who, when, device, before → after, reason and approver. Plus the same trail as a drawer on any record (reservation, folio, POS bill, room).
29. Notifications and approvals inbox: bell menu and full list (what each role is alerted about), and one approvals inbox for over-limit requests, refunds, POs and payroll runs: approve or decline with a comment, from desktop or phone.
```

## Update 4: front desk working screens (30–36)

```
Continue the Vento Hotels design using the existing design system. Add these new screens without changing existing ones; reuse the existing folio, reservation and tape chart components. Desktop 1440px and mobile 390px, light and dark, with loading, empty, error and offline states. Front desk is keyboard-first: show shortcuts.

30. Arrivals, departures and in-house: the front desk's real home. Arrivals with room readiness, balance due and special requests; departures with balance and city ledger eligibility; in-house with folio balances. Bulk check-in for a group, print lists.
31. Front desk dialogs: modify reservation (with rate impact), cancel (policy, penalty, refund, reason), room move (ready rooms first, rate change, reason), post charge, take payment (method, reference, currency and FX, split across methods), refund (limit and approval), transfer charges between folios.
32. Group reservation and rooming list: many rooms under one booking, room types and counts, names added later (paste or upload a rooming list), master folio with routing, pick-up against the group block.
33. Rooms and rate plans: room types and rooms management (ongoing, not just onboarding), rate plan editor (meal plan, cancellation policy, deposit rule, channels, derived from a parent plan with an offset).
34. Cash and deposits: open cashier shift with float, blind count at close, deposits held (not yet applied, with ageing), and the payment matching queue (unmatched transfers and POS terminal settlements, suggested matches, match or mark for review).
35. Report viewer: one layout used by all 14 standard reports: filters (property, business date or period), totals, table, export PDF and Excel, print. Show it with the manager's flash report and the guest register.
36. Sync queue and conflicts: what is waiting to sync, what failed and why in plain words (e.g. "Room 214 was sold online while you were offline"), and what to do: retry, choose another room, or discard with a reason.
```

## Update 5: operations support (37–46)

```
Continue the Vento Hotels design using the existing design system. Add these new screens without changing existing ones. Desktop 1440px and mobile 390px, light and dark, with loading, empty, error and offline states. Screens used on phones or shared tablets (37, 39, 44) are touch-first with large targets.

37. Guest requests queue: where guest app requests land (towels, maintenance, late check-out, room service): assign, in progress, done, response time against target; room service orders flow to the POS and kitchen display.
38. Menu and outlet setup: menu items with modifiers, prices per outlet, tax category, kitchen or bar station and availability (86'd items); outlets, table map editor and printers.
39. Room checks on a phone: the attendant's discrepancy check (walk the floor, mark each room occupied or vacant, quick photo), the resulting sleeper/skipper alert, lost and found list, and laundry (guest charges and linen counts).
40. Overbooking alert: when an OTA booking arrives for a room type with no rooms left: what happened, how many rooms short, which dates, and options (move, upgrade, walk the guest to a partner hotel) with the cost of each.
41. Merge duplicate guests: suggested duplicates (same phone, email or name + ID), side-by-side comparison, choose which values to keep, merge with stay history combined; logged and undoable.
42. Licences and permits: per property: state tourism registration, NIHOTOUR, liquor licence, fire certificate, health permits; expiry timeline, documents, alerts before expiry.
43. Message templates and log: WhatsApp, SMS and email templates (confirmation, pre-arrival, receipt, review request, owner's daily report) with merge fields and approval status; log of messages sent per guest with delivery status.
44. Back-of-house on shared devices: receiving a delivery on a phone at the gate (PO lines, counts, photo of the delivery note) and staff clock in / clock out with the PIN pad.
45. Receivables and payables: city ledger invoices and credit notes, expenses and supplier bills with payments, and budgets entry by property, department and month.
46. Account and support: the hotel group's Vento subscription (plan, invoices, payment), and granting Vento support time-limited access to the account (who, how long, revoke anytime, logged).
```
