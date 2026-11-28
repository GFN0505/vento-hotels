# Night audit

## Who, goal, device, stage
- **Who:** Ibrahim Musa, night auditor at Kora Victoria Island (a `front_desk` member allowed to run night audit at night; see Open questions). Tunde Bello approves a waiver from his phone. A finance member corrects a mistake the next morning.
- **Goal:** close business date 25 Nov 2026 cleanly: every arrival, departure, bill and shift accounted for, room and tax charges posted, reports out, ledger posted, business date moved to 26 Nov.
- **Device:** front desk PC 2 at Kora Victoria Island. Tunde on his own phone (password + 2FA). Night housekeeping on a housekeeping phone.
- **Stage:** 1 (front office). The 22:00 room check is stage 2, the open bill at the Pool bar is stage 3, ledger posting is stage 5 (see Open questions).
- **Screens:** 15 night audit wizard, 30 arrivals/departures/in-house, 5 reservation detail, 31 cancel/no-show dialog, 39 room checks and discrepancy alert, 34 cash (shift close), 11 POS (open bill), 35 report viewer, 20 owner's daily report, 29 approvals inbox, 36 sync queue, 28 audit log, 7 folio (correction).

Calendar date is **Thu 26 Nov 2026**, 00:30. Business date is still **Wed 25 Nov 2026**; the top bar shows both ("Business date 25 Nov · Today 26 Nov"). Amounts marked * include tax lines from the seed's tax configuration.

## The walkthrough

1. **23:00 Start of shift.**
   - *Does:* signs in on PC 2 and opens his cashier shift with a ₦20,000.00 float.
   - *Sees:* in-house 86, arrivals still due 2, departures not checked out 1 (the Front desk lists' In house, Arrivals and Departures, counted from checked-in stays since brick 8).
   - *Behind the scenes:* audit events `member.signed_in`, `cashier_shift.opened`.

2. **00:30 Open the night audit wizard.**
   - *Does:* ⌘K → "Night audit".
   - *Sees:* #15 with four pre-checks, each with a count and a fix link: Arrivals not checked in (2), Departures not checked out (1), Open POS bills (1, Pool bar), Shifts not closed (1, Pool bar). Calabash is already clear: Femi and Halima settled table 15 at 23:10 (see `waiter-dinner-service.md`). Also a fifth check: Room discrepancies unresolved (1, from the 22:00 room check). "Run audit" is disabled until all are green or explicitly handled.
   - *Behind the scenes:* the checks are queries for business date 25 Nov. Audit event `night_audit.started` (Ibrahim, PC 2, 25 Nov).

3. **Arrival not checked in: mark no-show with the policy charge.**
   - *Does:* opens reservation VI-2611-0391, Standard Queen, 25–27 Nov, guaranteed by a ₦147,000.00* transfer deposit (first night with tax lines). No call, no message. Clicks "Mark no-show".
   - *Sees:* the dialog (#31, the cancel dialog's no-show variant, from ⋯ More → Mark no-show): "Policy: Best available: a no-show is charged the first night. Penalty First night · ₦147,000.00*. 2 nights released (25 and 26 Nov)." He clicks Mark no-show · ₦147,000.00 penalty.
   - *Behind the scenes:* one transaction: status `no_show`, penalty recorded to charge on business date 25 Nov, Standard Queen released for 25 and 26 Nov (locked rows). From brick 10 the penalty posts with tax lines and is paid from the deposit held. Audit events `reservation.no_show`, `penalty.recorded`.

4. **Arrival not checked in: waive with permission.**
   - *Does:* opens VI-2611-0405, Deluxe King, 25–26 Nov, deposit ₦150,000.00*. The reservation note from 21:30 says the guest's Abuja flight was cancelled. Ibrahim can't waive penalties, so he ticks Waive the penalty, reason "Flight cancelled, guest called 21:30", Ask to waive, picks Tunde and taps "Mark no-show now and send the waiver to Tunde's inbox".
   - *Sees:* "Marked no-show · waiver sent to Tunde"; the Penalty card reads "Waiver asked of Tunde Bello · expires 01:08". At 00:41 Tunde approves from the approvals inbox (#29) on his phone with his PIN; the card turns to "Waived · Approved by Tunde Bello".
   - *Behind the scenes:* the no-show and release happen at once; the waiver is applied when Tunde approves, in his transaction (decision 0028). Audit event `reservation.penalty_waived` with requester Ibrahim, approver Tunde and `exception: 'penalty_waived'`.

5. **Departure not checked out.**
   - *Does:* room 611 was due out 25 Nov with a late check-out to 18:00. The key is in the drop box and the folio balance is ₦0.00 (prepaid). Clicks "Check out" from the fix link.
   - *Sees:* "611 checked out. Room is vacant and dirty."
   - *Behind the scenes:* `stay.checked_out` at 00:44 against business date 25 Nov; no room charge for 25 Nov is posted to that stay.

6. **Open POS bill at the Pool bar.**
   - *Does:* sees "Pool bar · Table 2 · ₦31,200.00 · open since 23:15 · Femi". Femi is covering the bar's last orders. Ibrahim has no POS permissions, so he calls him. Femi asks the guest to sign and posts the bill to room 401 (in house, name checked).
   - *Sees:* the check refreshes to green on its own within seconds.
   - *Behind the scenes:* check status `posted_to_room`; charge lands on the room 401 guest folio with tax lines on business date 25 Nov. Audit event `pos_check.posted_to_room` (Femi, bar tablet, Pool bar).

7. **Shift not closed at the Pool bar.**
   - *Does:* sees the Pool bar's cashier shift (Femi, bar tablet) still open. Femi closes the bar, does his blind count at 00:52 and submits.
   - *Sees:* "Pool bar · Femi · Closed · Variance ₦0.00". The shifts list also shows Halima's Calabash shift, closed at 22:45 with "₦1,000.00 short · Reason: change given twice on table 2", which counts as balanced because the variance has a reason.
   - *Behind the scenes:* `cashier_shift.closed` with counted, expected and variance. Halima's variance is already an exception for the owner's daily report; a variance without a reason would keep this check red.

8. **Room discrepancy from the 22:00 check.**
   - *Does:* opens the alert (#39): "Room 402 found vacant at 22:00; shown occupied since 24 Nov." Calls the room at 00:55; the guest answers. Resolves with reason "Guest out at check time, confirmed in room 00:55".
   - *Sees:* alert resolved, his name and the reason in the timeline.
   - *Behind the scenes:* audit event `room_discrepancy.resolved` (type `sleeper`, reason, resolver Ibrahim). It is listed as resolved in the owner's report.

9. **01:00 Run audit: post room and tax charges.**
   - *Does:* all checks green. Clicks "Run audit for 25 Nov 2026".
   - *Sees:* progress "Posting room charges · 40 of 85". 85 occupied rooms, 1 out of order (503, AC fault), 119 available. Mr Mensah in 502: ₦180,000.00 to the Acme folio with VAT, Lagos consumption tax and service charge lines. The Okoros in 302: ₦102,000.00 with the same tax lines on their own folio.
   - *Behind the scenes:* a pg-boss job per step. Each room charge carries a unique key (stay + business date + `room`), so a retry never posts twice. Tax lines stored with rate, base and amount from the configuration in force on 25 Nov. Day use in 304 counts in revenue but not in room nights.

10. **01:07 The internet goes down.**
    - *Does:* nothing he can do on the server side. The offline banner appears.
    - *Sees:* "Offline · Last update 01:07 · Posting room charges 52 of 85". The wizard's buttons are disabled with "Night audit needs a connection." He can still read the in-house list (marked "as of 01:07"), change room status, and take cash on his shift; those show "Saved on this device".
    - *Behind the scenes:* the audit runs on the server, so posting continues while the hotel is offline. Nothing on PC 2 can start, skip or repeat a step offline. Rolling the business date and closing a shift are blocked offline.

11. **01:22 Back online.**
    - *Does:* the banner clears; the wizard refreshes.
    - *Sees:* "Room and tax charges posted · 85 of 85 · ₦13,515,000.00 room revenue before tax lines". If the server job had stopped, the step shows "Interrupted at 52 of 85 · Resume", and resuming posts only the 33 missing charges.
    - *Behind the scenes:* commands queued on PC 2 (a cash payment at 01:12) sync with their idempotency keys and post to business date 25 Nov, because 25 Nov isn't closed yet.

12. **Reports.**
    - *Does:* waits for the reports step, opens the manager's flash in the report viewer (#35).
    - *Sees:* manager's flash, revenue by department and payment method, cashier/shift reports (Chiamaka, Halima, Femi, Ibrahim), guest register with foreign nationals section (Mr Mensah), no-shows and cancellations (VI-2611-0391 charged, VI-2611-0405 waived), rate override and discount report (Okoro 15%, approved by Tunde), deposits held.
    - *Behind the scenes:* reports are frozen as of the close of 25 Nov and stored, so reprints match.

13. **Ledger posting.**
    - *Sees:* "Posted to Kora Hospitality Ltd ledger · balanced". Room, F&B and penalty revenue by department; VAT payable, Lagos consumption tax payable, service charge payable; guest ledger and city ledger.
    - *Behind the scenes:* one journal per property per business date, debits equal credits or the step fails and the date doesn't roll.

14. **01:31 Roll the business date.**
    - *Does:* clicks "Close 25 Nov and start 26 Nov".
    - *Sees:* "Business date is now 26 Nov 2026." The top bar updates on every device at Kora Victoria Island as they reconnect.
    - *Behind the scenes:* business date moves forward once; running the audit again for 25 Nov returns "Already closed". Audit event `night_audit.completed`. The owner's daily report for each property is queued to send by WhatsApp and email (Kora Abuja and the other properties close their own dates separately).

15. **09:15 next morning: a mistake found after audit.**
    - *Does:* Chiamaka notices the Okoro folio has the same ₦18,000.00 laundry charge twice on 25 Nov. She can't void it: 25 Nov is closed and she only voids her own postings on the same business date. She requests a correction with reason "Duplicate laundry posting".
    - *Sees:* finance gets the request; the finance member posts a correction on business date 26 Nov linked to the original line, with the original tax lines reversed at the rates stored on that line.
    - *Behind the scenes:* the original posting stays; a negative posting points to it. The ledger gets a reversing entry dated 26 Nov. The 25 Nov reports are not changed; the correction appears in the 26 Nov owner's report as an exception.

## What can go wrong
- **Audit started twice** (two PCs, double click): the second gets "Night audit for 25 Nov is already running (Ibrahim, PC 2)."
- **Check can't be fixed** (bar still trading at 01:00): the wizard keeps "Run audit" disabled and says which item blocks it; see Open questions.
- **Waiver not approved:** the no-show stands with the penalty to charge; Ibrahim or the day team can ask again from the Penalty card; once posted (brick 10) removing it is a folio correction.
- **Ledger doesn't balance:** "Ledger is out by ₦… on 25 Nov. Business date not moved." Finance is notified; front desk keeps working on 25 Nov.
- **Power cut on the PC:** the server keeps going; Ibrahim reopens on any registered PC and the wizard shows where it is.
- **Offline postings for a closed date:** if a device syncs after 25 Nov is closed, its postings go to 26 Nov with the original time kept and are flagged for the auditor in #36.
- **Tax rule changes at midnight:** charges for 25 Nov use the rule in force on 25 Nov, never the one effective 26 Nov.

## Targets
- Pre-checks to rolled date: under 15 minutes on a normal night, excluding phone calls.
- Each fix link reaches the record in 1 click; each fix in ≤ 3 clicks.
- Posting 120 rooms with tax lines: under 30 seconds on the server.
- Resume after a connection drop: no manual cleanup, no duplicate postings.

## Becomes tests
`apps/web/e2e/journeys/night-audit.spec.ts`
- "Run audit" stays disabled while any pre-check is red; each fix link opens the right record.
- No-show posts the policy penalty with tax lines on business date 25 Nov, applies the deposit and releases future inventory.
- Waiver is refused for front desk alone; with GM approval no penalty posts and the audit event has requester and approver.
- Open POS bill and unbalanced shift block the audit until closed; the variance requires a reason.
- Unresolved room discrepancy blocks the audit; resolution needs a reason.
- Room charges post once per stay per date: running the step twice, or killing the job mid-step and resuming, yields exactly 85 charges.
- Offline during the audit: wizard actions are disabled, server state completes, the device catches up on reconnect.
- Ledger journal for 25 Nov balances for Kora Hospitality Ltd.
- Business date becomes 26 Nov; a second audit for 25 Nov is refused; the owner's daily report job is queued.
- After audit, front desk can't void a 25 Nov posting; finance can post a linked correction dated 26 Nov, and 25 Nov reports are unchanged.

## Open questions
- **Night auditor role:** settled in `docs/DOMAIN.md`: the night auditor is a `front_desk` member on the night shift with the run-night-audit permission. Still open: is "night shift" a roster shift, a time window, or a flag on the member?
- **Remote approval:** DOMAIN says the approver signs in or enters their PIN on the same device; screen 29 allows approving from a phone. Is remote approval allowed for waivers at night? *Answer:* yes: the inbox is the same mechanism for any kind (Stage 1 brick 5); waivers use it from brick 6.
- Should an open POS bill be allowed to **carry over** to the next business date when an outlet trades past audit, or must every bill close first?
- Can someone close **another person's cashier shift** (e.g. a cashier who went home)? Who, and with what witness?
- Is a **waived no-show penalty** an exception in the owner's daily report? *Answer:* yes, "penalty waived" (Stage 1 brick 6), with requester, approver, amount and reason.
- What time is the owner's daily report sent: as soon as audit finishes, or at a fixed morning time? With four properties, one message or one per property?
- Room discrepancy checks, POS and the ledger are stages 2, 3 and 5, but night audit is stage 1. Which checks and steps does the stage 1 audit include?
- The demo world has no named **finance** member for the correction. Add one to the seed?
- Is "post room and tax charges" allowed to start automatically at a set time if no one runs the audit?
