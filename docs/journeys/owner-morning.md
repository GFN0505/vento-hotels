# Owner's morning

## Who, goal, device, stage
- **Who:** Mrs Adaeze Okafor, owner (`owner`) of Kora Hotels Group. Tunde Bello (GM, Kora Victoria Island) receives her note.
- **Goal:** in under 2 minutes, know how her four hotels did yesterday, look at anything unusual, ask about it, and check whether Acme Energy is paying.
- **Device:** her own phone (mid-range Android, mobile data), WhatsApp, then the Vento web app signed in with password + 2FA (session remembered on this personal device).
- **Stage:** 1 (owner's daily report). The bar void needs stage 3, city ledger ageing stage 5, group home stage 6 (see Open questions).
- **Screens:** 20 owner's daily report and Leakage, 28 audit trail drawer, 45 receivables (city ledger), 15 city ledger ageing, 1 group executive home, 29 notifications.

**Setting:** Thursday 26 Nov 2026, 07:00. Night audit closed business date 25 Nov at Kora Victoria Island at 01:31 (`night-audit.md`) and at Kora Abuja at 01:12. Everything in the report happened in `front-desk-morning.md`, `room-attendant-shift.md`, `waiter-dinner-service.md` and `night-audit.md`.

## The walkthrough

1. **06:58 The report arrives.**
   - *Does:* opens WhatsApp.
   - *Sees:* four messages from Vento Hotels, one per property (format is an open question). Kora Victoria Island:
     > Kora Victoria Island · 25 Nov 2026: Occupancy 71% (85 of 119) · ADR ₦159,000 · Revenue ₦18.6M · Collected ₦8.9M. Exceptions (9): 1 discount above 10% (Chiamaka, approved by Tunde) · 1 quick turn (Room 304, Chiamaka) · 2 POS voids after send (Calabash ₦10,000, Pool bar ₦38,000, approved by Femi) · 1 comp ₦6,000 (Femi) · 1 cash variance ₦1,000 short (Calabash, Halima) · 1 bill open past closing (Calabash table 15, Emeka) · 2 room discrepancies resolved (Room 406, Room 402). Full report: {link}

     Kora Abuja: "Kora Abuja · 25 Nov 2026: Occupancy 73% (76 of 104) · ADR ₦142,000 · Revenue ₦14.6M · Collected ₦6.9M. No exceptions for 25 Nov 2026." Kora Ikeja GRA and Kora Port Harcourt follow the same format.
   - *Behind the scenes:* queued by each property's night audit, rendered from the frozen 25 Nov reports, sent through the `WhatsAppProvider` and by email. Available room nights exclude 503 (out of order). The day use in 304 adds to revenue but not to room nights. Delivery status logged (#43).

2. **07:00 Open the full report.**
   - *Does:* taps the link. The app opens signed in.
   - *Sees:* #20 on mobile: the numbers first, then exceptions grouped by type, each a row: type, amount, staff, reason, approver. Calm colours: rose only for unresolved items. Right now, nothing is unresolved.
   - *Behind the scenes:* the link is a normal app URL, not a public page: it opens only for a signed-in member with "View owner's daily report and leakage alerts" (owner, GM, finance). Audit event `report.viewed`.

3. **07:01 Drill into the quick turn.**
   - *Does:* taps "Quick turn · Room 304 · ₦147,000.00".
   - *Sees:* the audit trail drawer (#28) for the stay, in order:
     - 11:40 Walk-in created · Standard Queen · BAR ₦120,000.00 · Chiamaka · PC 1
     - 11:41 Paid ₦147,000.00 by POS terminal · ref MP-RRN-… · Chiamaka
     - 11:42 Registration captured · key issued · Chiamaka
     - 14:30 Checked out · reason "Guest's flight moved forward" · Chiamaka
     - 15:10 304 clean · Blessing; 15:25 inspected · Grace
   - The exception reads: "Room 304 checked out 2 h 50 min after check-in. Charged ₦120,000.00 (full night) plus tax lines. No refund."
   - *Behind the scenes:* quick turns are generated from audit events against a configured threshold. The copy states facts, names who was on record, and stops; no "suspicious".

4. **07:01 Ask the GM.**
   - *Does:* taps "Add note", types "Tunde, please confirm the 304 guest's ID matches the registration card. Thanks." and sends.
   - *Sees:* "Note sent to Tunde Bello". The exception now shows "Asked Tunde · 07:01" instead of a resolved tick.
   - *Behind the scenes:* note stored on the exception and sent as a notification to Tunde (#29). Audit event `exception.note_added`. Chiamaka isn't notified and can't see the exception.

5. **07:02 The voided bar bill.**
   - *Does:* taps "POS void after send · Pool bar · ₦38,000.00".
   - *Sees:* "Pool bar · Table 3 · ₦38,000.00 · 21:40 · Rung by Femi · Voided after send · Reason: entered on wrong table, re-rung on table 6 · Approved by Femi." Below, the linked bill: "Table 6 · same items · ₦38,000.00 · 21:42 · paid POS terminal ₦46,550.00 with tax lines."
   - *Behind the scenes:* the drawer shows the device (bar tablet), the original ticket time and the re-rung bill found by item match. Femi approved his own void because the F&B manager role can void after send without approval; see Open questions.
   - *Does:* taps "Mark reviewed".

6. **07:03 Acme's balance.**
   - *Does:* ⌘K on mobile (search) → "Acme".
   - *Sees:* Acme Energy Ltd: balance ₦9,849,000.00 of ₦15,000,000.00 limit (66%), 30-day terms. Ageing: 0–30 days ₦6,129,000.00 · 31–60 days ₦3,720,000.00 · 61–90 ₦0.00 · 90+ ₦0.00. The 31–60 line is one invoice: "Opening balance · invoice from old system · 12 Oct 2026 · ₦3,720,000.00 · 45 days". Last payment: none since go-live. Sales contact and accounts contact.
   - *Behind the scenes:* ageing from invoice dates, including opening balances imported at go-live (`going-live.md`) with their original dates. The 25 Nov settlement from 502 (₦661,500.00) is in 0–30, with the 2 Nov opening invoice (₦2,160,000.00) and Acme's invoices since go-live (₦3,307,500.00).
   - *Does:* taps "Send statement" to Acme's accounts contact (email, PDF). Chooses to let Tunde chase by phone: adds a note on the account "Please call Acme about the October invoice."

7. **07:04 Group home.**
   - *Does:* taps Home.
   - *Sees:* group executive home (#1): all four properties side by side. Occupancy 71% at Kora Victoria Island and 73% at Kora Abuja, ADR, RevPAR, revenue by department, cash by entity (Kora Hospitality Ltd), city ledger total, and "Needs attention": "Acme Energy Ltd · ₦3,720,000.00 over 30 days", "Room 503 out of order until 27 Nov · AC compressor".
   - *Then:* taps the Kora Abuja row to see that hotel's day (its Home as its GM sees it), and **All hotels** in the banner to come back. The top-bar hotel switch offers the same: **All hotels** first, then each hotel.
   - *Behind the scenes:* group figures read from the closed business dates of each property, so a property still before its audit shows its last closed date with a label.

8. **Done.**
   - *Sees:* total time from opening WhatsApp: 1 minute 50 seconds.
   - *Behind the scenes:* later, Tunde answers the note: "ID checked, matches. Guest is a regular." He resolves it with that reason; the exception shows resolved with his name.

## What can go wrong
- **Report not sent:** if night audit hasn't finished at a property by the send time, she gets "Kora Victoria Island: night audit for 25 Nov not closed yet. Report will follow when it is." She never gets a report with half the numbers.
- **WhatsApp delivery failed:** email still arrives; the failure shows in the message log (#43) and to the GM.
- **Link opened by someone it was forwarded to:** they see the sign-in page; without the permission, "You don't have access to this page."
- **Slow mobile data:** the report page shows the numbers first (small payload), exceptions load after; tested on slow 3G.
- **No exceptions:** "No exceptions for 25 Nov 2026." Nothing else.
- **Exception unresolved for days:** stays rose at the top of the next report with its age: "Open since 25 Nov · Asked Tunde".
- **A finance correction after audit** (the duplicate laundry on the Okoro folio, `night-audit.md`) appears in the 26 Nov report as a post-audit correction, not by changing the 25 Nov report.

## Who sees what
| | Owner | GM (Kora Victoria Island) | Finance | Front desk, cashier, waiter |
|---|---|---|---|---|
| Owner's daily report, all properties | ✓ | Kora Victoria Island only | ✓ (their entities) | – |
| Leakage screen and exceptions | ✓ | Kora Victoria Island only | ✓ | – |
| Add note / resolve exception | ✓ | ✓ (own property) | ✓ | – |
| City ledger ageing | ✓ | Kora Victoria Island accounts | ✓ | – |

Staff named in exceptions never get a notification that they were named; their manager does.

## Targets
- WhatsApp summary readable in 30 seconds.
- Link to full report: under 1 s on a mid-range Android phone with mobile data (numbers first).
- Each exception to its audit trail: 1 tap.
- Whole morning check: under 2 minutes.
- Report sent within 10 minutes of night audit finishing (or at the configured time).

## Becomes tests
`apps/web/e2e/journeys/owner-morning.spec.ts`
- After night audit, the owner's daily report job produces one summary per property with occupancy, ADR, revenue, collected and exceptions grouped by type with staff names.
- Kora Abuja with no exceptions renders "No exceptions for 25 Nov 2026."
- Report copy contains no alarm words ("fraud", "suspicious", "theft", "caught").
- Owner sees all four properties; Tunde sees only Kora Victoria Island; a front desk member gets "no access" on the report URL and on the leakage API.
- Quick turn exception opens the stay's audit trail with times, actor, device and reason.
- Adding a note notifies the GM and records an audit event; the exception shows "Asked Tunde".
- POS void exception shows actor, approver, reason and the linked re-rung bill.
- Acme ageing puts the 12 Oct opening balance invoice in 31–60 and the 25 Nov invoice in 0–30; totals equal the balance.
- Mobile layout at 375px: no horizontal scroll on the report and Leakage screens.

## Open questions
- **One WhatsApp message per property or one for the group?** The ux-writing example is per property; Mrs Okafor already gets four messages, and a bigger group may want one.
- **Send time:** right after each audit (Kora Victoria Island 01:31) or batched at a fixed morning time?
- **Self-approved voids:** Femi rang and voided the bar bill himself. The F&B manager role needs no approver for a void after send. Should a void by the same person who rang the bill need a second person?
- **Ageing basis:** by invoice date or by due date? For 30-day terms the 12 Oct invoice is 45 days old but 15 days overdue.
- **Notes vs resolution:** can the owner resolve an exception, or only comment? Who closes a note thread?
- Is a **waived no-show** an exception? Is a **post-audit correction**? Neither is in DOMAIN's exception list.
- ADR here excludes the day use from room nights but its revenue is in room revenue. Confirm whether day-use revenue counts in ADR.
- Kora Abuja's GM and staff aren't named in the demo world.
- Stage 1 promises the owner's daily report, but POS voids, comps, room discrepancies, city ledger ageing and group home come in stages 2–6. What does the stage 1 report contain?
