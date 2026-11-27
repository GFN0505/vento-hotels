# Modify, cancel and no-show

- **Status:** approved (owner, 2026-11-27: all four open questions answered as recommended)
- **Stage:** 1 (brick 6 of the plan in [stage-1-plan.md](stage-1-plan.md)). Depends on brick 4 (the booking service and its lock order, `quoteStay`, `priceStay`, the stored nights and terms snapshot with deadline and `penaltyAmount`, the reservation detail and list) and brick 5 (approvals: `ApprovalPrompt`, the inbox, `useApproval`, eligibility, the expiry job). Feeds brick 7 (room moves and the tape chart's drag-to-extend reuse the change service), brick 8 (in-house extend and leave early reuse its pricing rule; walk-ins), brick 10 (penalties **to charge** are posted to a folio and paid from the deposit held), brick 12 (penalties on company-guaranteed stays go to the company), brick 13 (night audit lists arrivals not checked in and links to **Mark no-show**), brick 15 (No-shows & cancellations report), brick 16 (the waiver exception), Stage 4 (OTA and guest-app modifications and cancellations go through the same service).
- **Module:** Reservations & Front Desk (`docs/PRODUCT.md` module 1: reservations, availability, deposits and guarantees).
- **Walkthroughs:** `front-desk-morning.md` new steps 6c and 6d, "What can go wrong" and "Becomes tests"; `night-audit.md` steps 3–4, "What can go wrong" and Open questions; `guest-stay.md` a Stage 1 note on the cancellation path (listed under "Changes needed in walkthroughs").
- **Screens:** Modify / cancel reservation (#31: `DlgModify.dc.html`, `DlgModifyM.dc.html`, `DlgCancel.dc.html`, `DlgCancelM.dc.html`); where the actions sit: Reservation detail (#5, `ReservationDetail.dc.html` header: **Cancel**, **Modify** (M), the ⋯ menu "More: no-show, duplicate, print"); the approval prompt and inbox from brick 5 (#22, #29). The no-show dialog is the cancel dialog's variant (no design of its own). Not this brick: Room move (#31, brick 7), Check in (#6, brick 8), the deposit held row (#34, brick 10).
- **Decisions:** `0004-money-folios-and-ledger.md` (penalties become append-only postings from brick 10), `0006-business-date-and-night-audit.md`, `0007-availability-locking-and-ota-overbookings.md`, `0008-permission-limits-approvals-audit.md`, `0018-permissions-and-audit-in-practice.md`, `0021-feature-switches.md` (behind `front_desk`), `0027-approvals.md` (two new kinds). Proposed with the build: **0028 · A penalty waiver applies when it is approved** (Open question 4).

## Problem
Guests change their plans all the time: "add one more night", "make it the Executive", "my flight moved to Thursday", "cancel, the meeting is off". Today the desk edits the booking book or the old PMS by hand, the price for the new night is whatever the agent remembers, and nobody can say whether the room on the new night was really free. Cancellations are worse for the owner: the policy says the first night is charged after the deadline, but the agent decides on the phone whether to charge it, there is no record of who let the guest off, and a no-show's room simply sits empty without anyone writing down what the hotel was owed. Brick 4 can book and brick 5 can approve, but a booking can't yet be changed or cancelled at all, so a mistake or a change of plan leaves a room held that nobody will use.

## Persona and job
- **Front desk agent** (Chiamaka Eze, FD-VI-01, PIN session): changes dates, room type or guests several times a day at Kora Victoria Island, usually on the phone; cancels a few a day; can't waive a penalty (matrix) and asks a manager. Needs the new price and availability on screen before she says yes to the guest.
- **Night auditor** (Ibrahim Musa, front desk on the night shift, PC 2): marks tonight's arrivals who never came as no-shows before closing the day, and asks Tunde to waive one when the guest had a good reason (`night-audit.md` steps 3–4).
- **GM** (Tunde Bello) and **revenue manager** (Sade Bakare): waive penalties directly (matrix), or approve a desk agent's waiver by PIN at the desk or from the inbox on their phone.
- **Owner** (Mrs Adaeze Okafor): next morning, sees every waived penalty with names, amount and reason (brick 16), and the cancellations and no-shows with what each cost (brick 15).

## Success looks like
- Extend a stay by a night from the reservation detail in **4 clicks and under 30 seconds**, with the new night's price and availability shown before saving.
- Cancel with the policy's penalty in **3 clicks**; with a manager's PIN waiver at the desk in **6 clicks plus the PIN**.
- **Zero** overbookings from changes: every change locks the old and new nights in brick 4's order (concurrency tests, including a change racing a new booking for the last room, 200 runs).
- **Zero** penalties waived without the `penalty.waive` permission or an approval from someone who has it (server tests); every waiver is in the owner's daily report with requester, approver, amount and reason.
- After every change, cancel or no-show, `booked` on each inventory row equals the stay nights of confirmed stays (counter invariant test).
- The guest's agreed price never changes silently: unchanged nights keep their stored plan and sold prices (test).

## User flow
Kora Victoria Island, Wednesday 25 Nov 2026, business date 25 Nov 2026. Illustrative rates as in brick 4 (Deluxe King Bed & breakfast ₦168,000.00, ₦205,800.00 a night incl. service charge 10%, VAT 7.5% and Lagos consumption tax 5%; Executive King Best available ₦210,000.00, ₦257,250.00 incl. taxes).

**A. Extend a stay (Chiamaka, 11:10).** Ms Sarah Collins calls back: she'd like to stay until Sunday 13 Dec. Chiamaka finds VI-2611-0483 (brick 4's search, 2 clicks) and is on the detail.
1. **Modify** (or M) (click 1). The dialog (bottom sheet on phones): "Modify reservation · VI-2611-0483", "Sarah Collins · Deluxe King · Bed & breakfast". Fields **Arrive** Wed 9 Dec 2026, **Leave** Sat 12 Dec 2026, **Room type** Deluxe King, **Guests** 1 adult.
2. She sets **Leave** to Sun 13 Dec (clicks 2–3). The field shows "+1 night". The summary updates within a moment: "Sat 12 Dec · Bed & breakfast · new night at today's rate ₦168,000.00", "Service charge, VAT, consumption tax ₦37,800.00", **Stay total ₦617,400.00 → ₦823,200.00**. Emerald: "Deluxe King is free on 12 Dec. Same plan, no approval needed." Below: "Deposit due ₦205,800.00 by 27 Nov, 10:32 (unchanged) · Free cancellation until 7 Dec 2026, 14:00".
3. **Save · +₦205,800.00** (click 4). The dialog closes; the detail shows 9–13 Dec 2026 · 4 nights and ₦823,200.00. Toast "VI-2611-0483 changed · Copy confirmation". Activity: "Changed · 9–12 Dec → 9–13 Dec 2026 · ₦617,400.00 → ₦823,200.00 · Chiamaka Eze".

**B. Cancel inside the penalty window (Chiamaka, 11:20).** Mr Kelechi Obi calls: his Lagos meeting is off. VI-2611-0447, Executive King, Best available, 26–28 Nov · 2 nights, ₦514,500.00; free cancellation ended 24 Nov, 14:00.
1. **Cancel** (click 1). The dialog: "Cancel reservation · VI-2611-0447", "Arrives tomorrow · free cancellation ended 24 Nov 2026, 14:00". Box: Policy "Best available: free until 48 h before arrival"; Penalty "First night · ₦257,250.00"; Rooms "2 nights released (26 and 27 Nov)"; **Penalty to charge ₦257,250.00**.
2. **Reason** pill **Guest request** (click 2), note "Meeting moved to January".
3. **Cancel booking · ₦257,250.00 penalty** (click 3). Detail: badge **Cancelled**, banner "Cancelled 25 Nov 2026, 11:20 by Chiamaka Eze · Guest request · “Meeting moved to January”", Penalty card "₦257,250.00 · First night · To charge". Toast "VI-2611-0447 cancelled". Executive King on 26 and 27 Nov has one more room left on every screen.

**B′. The same, with a waiver approved at the desk.** Mr Obi is a regular and Tunde agrees to waive it.
3. Chiamaka ticks **Waive the penalty** (click 3); **Reason for waiving** appears (required): "Regular guest, rebooking for January". Inline: "Waiving needs a manager. Tunde, Sade or Adaeze can approve it." The button reads **Ask to waive ₦257,250.00** (click 4).
4. Brick 5's approval prompt: "Needs a manager", "Waive penalty ₦257,250.00 on VI-2611-0447 · Kelechi Obi", "Chiamaka can't waive penalties. Asked at 11:21 on FD-VI-01.", the policy and reason, **Approving manager** pills (Sade Bakare, Tunde Bello, Adaeze Okafor). Tunde taps his name (click 5) and enters his PIN.
5. **Approve waiver and cancel** (click 6). Detail: **Cancelled**; Penalty card "₦257,250.00 · Waived · Approved by Tunde Bello · “Regular guest, rebooking for January”". Toast "VI-2611-0447 cancelled · penalty waived".

**C. No-show at night (Ibrahim, 00:35 on 26 Nov, business date still 25 Nov).** VI-2611-0391, Standard Queen, Best available, 25–27 Nov, didn't arrive and didn't call.
1. ⋯ **More** → **Mark no-show** (clicks 1–2). Dialog "Mark no-show · VI-2611-0391", "Arrival 25 Nov 2026 · not checked in". Policy "Best available: a no-show is charged the first night"; Penalty "First night · ₦147,000.00"; Rooms "2 nights released (25 and 26 Nov)".
2. **Mark no-show · ₦147,000.00 penalty** (click 3). Badge **No-show**; Penalty "₦147,000.00 · First night · To charge".

**C′. No-show with a waiver from the inbox.** VI-2611-0405 (Deluxe King, 25–26 Nov): the note from 21:30 says the guest's Abuja flight was cancelled. Ibrahim ticks **Waive the penalty**, reason "Flight cancelled, guest called 21:30", **Ask to waive ₦183,750.00**, taps **Tunde Bello**, then **Not nearby? Mark no-show now and send the waiver to Tunde's inbox**. The no-show is recorded at once and the rooms released; the Penalty card reads "₦183,750.00 · Waiver asked of Tunde Bello · expires 01:08". At 00:41 Tunde approves from his phone with his PIN; within seconds the card reads "Waived · Approved by Tunde Bello" (Open question 4). Declined or expired: it stays **To charge** with **Ask again**.

## Acceptance criteria

### Main path
**What this brick delivers**
1. The **change service** on the server: modify (dates, room type, guests, discount), cancel and mark no-show, each in one transaction under brick 4's locks, idempotent, with a version check.
2. The **penalty**: computed from the stay's stored terms, recorded on the reservation as **to charge**, or **waived** with a reason by someone with `penalty.waive` or with an approval. Posting it as a charge is brick 10.
3. **Modify**, **Cancel** and **Mark no-show** on the reservation detail, with dialogs on desktop and bottom sheets on phones.
4. Two approval kinds: `penalty_waiver` (permission without a limit: "ask someone who has it") and `modify_discount` (an over-limit discount on a changed stay).
5. The cancelled and no-show states on the list and detail; **Copy cancellation**.
6. Demo seed changes, cancellations, no-shows and waivers.

**Which reservations can be changed** (server rule; the buttons follow it)
| Status and dates | Modify | Cancel | Mark no-show |
|---|---|---|---|
| `confirmed`, arrival after the business date | yes | yes | no |
| `confirmed`, arrival on the business date | yes | yes | yes |
| `confirmed`, arrival before the business date (night audit didn't mark it) | no | no | yes |
| `cancelled`, `no_show` | no | no | no |
| `checked_in`, `checked_out` (from brick 8) | brick 8 (extend, leave early) | no | no |
- Hidden buttons are explained where the action would be: "This booking was cancelled on 25 Nov 2026." / "Arrival was 24 Nov 2026. Mark it as a no-show."
- One room per reservation in the screens (brick 4 Decision 6). The server modifies one stay (`stayId`) and cancels or marks every stay of the reservation; cancelling one room of several comes with groups (brick 14).

**Modify: what can change**
- **Arrive**, **Leave**, **Room type**, **Guests** (adults, children), and the discount through **Change rate** (brick 4's fields: Discount %, Rate per night, reason pills). The **rate plan can't change** here: switching plans changes the cancellation terms (a Non-refundable booking moved to Best available would escape its penalty). To change plan, cancel and book again; the cancel applies the policy.
- New arrival on or after the business date (`PAST_DATE`); departure after arrival; brick 4's limits (`TOO_FAR_AHEAD`, `STAY_TOO_LONG`, `TOO_MANY_GUESTS`).
- The **Room type** list shows only types the stay's plan sells; types that can't take the party are muted ("Sleeps 2 adults"); types short on any new night show "Sold out 12 Dec" and can't be picked. Archived types aren't listed.
- Nothing changed: **Save** is disabled ("Nothing to save yet").

**Modify: how the changed stay is priced** (Open question 1)
- A night is **kept** when its date and room type are unchanged: it keeps its stored plan price and sold price, even if the rate has changed since. The guest keeps the price they agreed.
- A night is **new** when it is a new date, or every night when the room type changes: priced from the **same plan** at its price for that room type and date **now** (`quoteStay` on the new stay inside the locks), so "Sat 12 Dec · new night at today's rate".
- **Extra adult** charges are re-quoted for every night when the number of guests changes; otherwise kept.
- **Discount on new nights:** an existing discount carries to new nights at the **same %** (a rate-per-night discount carries as the % it was on its first night). The carried % counts as a discount given by the person saving the change: within their `stay.rate_override` limit it saves; over it, **Save** becomes **Ask for approval · 15%** (kind `modify_discount`), or they tick **Price new nights without the discount**. Kept nights keep their sold prices whatever the limit.
- **Changing the discount** with Change rate applies to every night from their stored plan prices, with brick 4's rules (reason, not above plan, not ₦0, not below the meal allocation) and the same limit and approval. **Remove discount** sets every sold price back to its plan price.
- **Restrictions:** the changed stay is checked as at booking (`quoteStay` breaks); a break needs a reason ("Reason for booking through the min stay"), unless it is the same restriction on the same date already booked through with a reason.
- **Tax lines** per night with the rules in force on that night (brick 4); the summary shows the change in the total incl. taxes ("Stay total ₦617,400.00 → ₦823,200.00") and the button carries the difference ("Save · +₦205,800.00" / "Save · −₦205,800.00" / "Save").
- **Terms snapshot:** kept as accepted at booking (plan name, meal plan and allocation, cancellation policy, deposit rule, inclusive or exclusive). Recomputed from it on the new nights: the **cancellation deadline** (from the new arrival), the stored **penalty amount**, and the **deposit due**.
- **A passed deadline stays passed.** If the free-cancellation deadline had already passed when the change is saved, the stay keeps the passed deadline whatever the new arrival, so moving the dates can't reopen free cancellation.
- **Deposit due:** recomputed amount from the stored deposit rule; the due time stays as it was unless the amount goes up, when the whole amount is due by the rule counted from the change (or the new arrival's check-in time if sooner).
- **Late change** (Open question 2): after the deadline (or on a non-refundable plan), a change that **lowers the stay total** records a penalty = the policy applied to the drop: first night → the lower of the drop and the original first night incl. taxes; N% → N% of the drop; full stay or non-refundable → the drop. Shown in the dialog before saving ("Free changes ended 7 Dec 2026, 14:00. This change lowers the stay by ₦165,375.00, so a penalty of ₦165,375.00 applies.") and waivable exactly like a cancellation penalty. Changes that keep or raise the total cost nothing.
- **Quote and save:** the dialog calls `reservations.quoteChange` on each edit (debounced) and shows the server's figures; **Save** sends the `changeHash` it showed and the stay `version` it opened with. A different hash: nothing saved, the new figures shown ("The price changed since you opened this: …"). A different version: `RESERVATION_CHANGED` "Sade Bakare changed this booking at 11:08. Check the new details." and the dialog reloads.

**Cancel**
- **Reason** required: pills **Guest request**, **Company request**, **Deposit not paid**, **Duplicate booking**, **Other** (text required), plus an optional note (up to 500 characters).
- **Penalty applies** when the stay is **guaranteed** (guarantee other than `none`) and either the plan is non-refundable or the cancellation is after the stored deadline (a clock time in the hotel's time zone, not the business date: 13:59 on 7 Dec is free, 14:00 isn't). Amount: the stay's stored penalty amount (recomputed at each change). Unguaranteed stays are released without a penalty ("No penalty: this booking had no deposit or guarantee.").
- Free: the box says "Free cancellation until 7 Dec 2026, 14:00 · No penalty" and the button reads **Cancel booking**.
- After it: reservation and stays `cancelled`; every night released; a penalty recorded **to charge** (or **waived**); the deposit due stops being due.
- **Copy cancellation** replaces Copy confirmation on a cancelled reservation (UI copy).

**Mark no-show**
- From the ⋯ menu on the detail for a `confirmed` stay whose arrival is on or before the business date. After midnight, before night audit, the business date hasn't moved, so 25 Nov's arrivals are still that day's (Ibrahim at 00:35).
- **Policy:** a no-show costs the late-cancellation penalty in the stay's terms (the stored penalty amount; non-refundable = the full stay), when the stay is guaranteed. **All nights are released**, including the arrival night, so a late walk-in can take the room. Note optional ("Didn't call, phone off").
- The dialog says "Mark a no-show only when the guest won't arrive tonight." A guest who turns up after being marked is booked again (brick 8 walk-in) and the penalty waived with a reason; there is no un-mark.
- **Night audit (brick 13)** lists arrivals not checked in as a pre-check and links each to this dialog; whether audit marks the rest itself is brick 13's decision. This brick defines the policy and the action; it marks nothing automatically.

**Waive the penalty** (in the Cancel, Mark no-show and late-change dialogs, and later from the Penalty card)
- **Waive the penalty** checkbox shows **Reason for waiving** (required, up to 500 characters). It waives the whole amount; there are no partial waivers.
- **With `penalty.waive`** (revenue manager, GM, owner, group admin): the button reads **Cancel and waive ₦257,250.00** (or **Mark no-show and waive ₦183,750.00**); the penalty is recorded **waived** by them in the same transaction.
- **Without it** (front desk): the button reads **Ask to waive ₦257,250.00** and opens brick 5's approval prompt with kind `penalty_waiver`:
  - **Approve here** (registered device, approver's PIN): the cancel or no-show and the waiver happen together in one transaction that uses the approval.
  - **Send to {name}'s inbox**: the cancel or no-show is saved **now** (the rooms must be released), the penalty **to charge** with "Waiver asked of Tunde Bello · expires 11:51". When the approver approves with their PIN, the waiver is applied in **their** transaction (Open question 4). Declined: stays to charge, "Tunde Bello declined: “Policy applies for this rate”". Expired: stays to charge with **Ask again**.
- **Later:** a penalty still **to charge** shows **Waive penalty** (managers) or **Ask to waive** (others) on the detail's Penalty card, any business date, until brick 10 posts it (after that, removing it is a folio correction under brick 10's rules).
- Only one open waiver request per penalty; asking again cancels the earlier pending one.

**Reservation list** (brick 4's list, changed)
- Status badges **Cancelled** (rose) and **No-show** (rose); the Status filter gains them. **Upcoming** already excludes cancelled and now excludes no-shows. **All** shows them.
- For cancelled and no-show rows: Total shows the penalty ("₦257,250.00 penalty", "Waived", "No penalty"); Deposit shows "—".

**Reservation detail** (brick 4's detail, changed)
- Header actions per the design: **Cancel** (ghost, destructive), **Modify** (M), ⋯ **More** with **Mark no-show** (only when allowed). Audit trail as before. Room move and Check in still wait for their bricks.
- Cancelled or no-show: the badge, a banner "Cancelled 25 Nov 2026, 11:20 by Chiamaka Eze · Guest request · “Meeting moved to January”" (or "Marked no-show 26 Nov 2026, 00:35 (business date 25 Nov) by Ibrahim Musa"), the **Penalty** card (amount, basis, status: **To charge** amber, **Waiver asked** amber, **Waived** slate with who and why), and the Rate per night card titled "Rate per night · as booked". Modify and Cancel are gone.
- **Activity** gains lines: "Changed · 9–12 Dec → 9–13 Dec 2026 · ₦617,400.00 → ₦823,200.00", "Room type Deluxe King → Executive King", "Guests 1 adult → 2 adults", "Discount 15% on the new night · Approved by Tunde Bello (inbox)", "Cancelled · Guest request · Penalty ₦257,250.00", "Marked no-show · Penalty ₦147,000.00", "Penalty waived · ₦257,250.00 · “Regular guest, rebooking for January” · Approved by Tunde Bello (PIN on FD-VI-01)", "Waiver asked of Tunde Bello", "Tunde Bello declined the waiver: “…”".

### Organization isolation
- `reservation_changes` and `penalties` carry `organizationId`; every read and write filters by the organization from the auth context. A reservation, stay, penalty or approval id from another group answers "not found". Idempotency keys are unique per organization.

### Property scoping
- Changes, penalties and waivers belong to the reservation's hotel; a member without access to it gets `PROPERTY_NOT_FOUND`; an archived hotel's reservations are read-only ("This hotel was archived.").
- A PIN session acts only on its device's hotel. Approvers must work at the hotel (brick 5).
- **Hotel switch:** the detail is a hotel page reached with `?hotel=`; the list keeps brick 4's group behaviour. Changing the hotel with a dialog open closes it through the leave guard ("Discard this change?"; with a pending discount request, "Your request to Tunde is cancelled.").

### Permissions, limits and approvals
| Action | Permission (matrix row) | Limit | Over it / without it |
|---|---|---|---|
| Modify dates, room type, guests | `reservation.manage` (Create / modify reservation) | – | – |
| Discount carried or changed on modify | `stay.rate_override` | front desk 10% (demo 12%), revenue manager 25%, GM 50%, owner any | approval kind `modify_discount` (brick 5 prompt; the requester completes the save after approval, as at Book) |
| Book through a restriction on modify | `reservation.manage` | – | reason required |
| Cancel, mark no-show | `reservation.manage` | – | – |
| Waive a cancellation, late-change or no-show penalty | `penalty.waive` (revenue manager, GM, owner / group admin) | none (any amount) | approval kind `penalty_waiver` from someone with `penalty.waive` |
- **Proposed matrix wording** (`docs/DOMAIN.md`): "Create / modify reservation" becomes "Create, modify or cancel a reservation; mark a no-show" (same roles, key unchanged). No new rows.
- **`penalty_waiver` eligibility** (brick 5's rule for a permission without a limit): works at the hotel, has `penalty.waive`, has a PIN, isn't the requester. The requester needs only `reservation.manage`, not the permission itself. Approver list ordered by role (revenue manager, GM, group admin, owner) then name, so the owner isn't the first ask (brick 5 orders by limit; with no limits it needs this tie-break).
- **Binding:** `penalty_waiver` binds to the reservation, stay, penalty kind, amount and the stay version it was computed on; `modify_discount` to the reservation, stay, version and the priced change hash. Both re-checked at use, single use, 30 minutes, never past the business date (decision 0027).
- Nobody approves their own waiver or discount (`SELF_APPROVAL`). All of it works in a PIN session on a shared front desk PC. Behind the `front_desk` switch.
- Denied: "Only front desk, revenue managers, GMs and the owner can change reservations. Ask your GM."

### Audit events
All with `recordAudit` in the change's transaction: actor, device, property, business date, before/after, reason, approver.
- `reservation.modified`: change id, stay id, version before → after; before/after arrival, departure, room type, adults, children, nightly plan and sold prices (kept and new nights marked), totals, deposit due, cancellation deadline and penalty amount; restriction reason if any; `liveProperty`.
- `stay.discount_applied` (brick 4's event, with `exception: 'discount'`): written when a modify discounts **new** nights (carried) or changes the discount; `after` lists only the nights newly discounted and adds `changeId`; `approverMemberId` set when approved.
- `reservation.cancelled`: reason, reason text, note, nights released, penalty (id, kind, amount, basis) or "none" and why (free, unguaranteed).
- `reservation.no_show`: note, nights released, penalty as above.
- `penalty.recorded`: penalty id, kind (`late_cancellation`, `late_change`, `no_show`), amount, basis (policy, nights used, deadline). One per penalty, so brick 10 and reports read one stream.
- `reservation.penalty_waived` (name from `night-audit.md`): penalty id, amount, reason, requester (when asked), `approverMemberId`, approval id and method, `exception: 'penalty_waived'`, `liveProperty`. When an inbox approval applies it, the actor is the approver's session and `after.requestedBy` names the requester.
- Brick 5's `approval.requested`, `.granted`, `.declined`, `.cancelled`, `.expired` for both new kinds.

### Leakage exceptions
- **Penalty waived** (new exception type): every waived penalty, with requester, approver, amount and reason. Owner's daily report line (brick 16): "Penalty waived · VI-2611-0405 Deluxe King · No-show · ₦183,750 · Ibrahim Musa · Reason: flight cancelled, guest called 21:30 · Approved by Tunde Bello". A manager's own waiver: "… · Tunde Bello · Reason: …" with no approver. Before go-live, `liveProperty: false` (not reported).
- **Discount** (existing): a discount carried onto new nights or changed on modify is a discount like any other.
- Cancellations and no-shows with the penalty recorded, and free cancellations, are facts for the **No-shows & cancellations** report, not exceptions.

### Offline behaviour
- Modify, cancel, mark no-show and waive need a connection: availability, the penalty window and approvals are only true on the server. Offline the buttons are disabled with "Changing a booking needs a connection."; an open dialog keeps its fields and disables its button with the same words. Nothing is queued.
- The detail and list stay readable under the offline banner (brick 4).
- A request sent just before the connection dropped is retried with the same idempotency key when it returns, if the dialog is still open ("Checking whether VI-2611-0447 was cancelled…"); never twice.

### Business date
- Arrival rules use the business date (table above; new arrival ≥ business date). The cancellation deadline is a clock time compared with now.
- Every change, cancel, no-show, penalty and waiver records the hotel's business date when it happened; the penalty's business date is the one brick 10 and 13 post it on. A no-show marked at 00:35 is on business date 25 Nov.
- An approval from a previous business date can't be used (brick 5). A penalty stays **to charge** across business dates until waived or posted.
- After night audit (brick 13): a cancellation or no-show recorded on a closed business date stays as recorded; there is no un-cancel (book again).

### Tax lines
- Not stored on stays (brick 4). The dialog and detail compute them per night with the rules in force on each night.
- The **penalty amount** is the gross the guest was told under the policy (first night incl. taxes, N% of the total, or the total), recorded as a figure. How it is posted (as revenue with or without VAT, consumption tax and service charge lines) is brick 10's, after the legal check below.

### Foreign currency
- All amounts are NGN. For foreign nationals the dialogs add brick 4's display-only line under the new total and the penalty ("≈ £422.15 at ₦1,950/£, CBN, 25 Nov 2026" under ₦823,200.00). Nothing foreign is stored.

### Availability locking
- **Change transaction order:** the hotel's rates lock (shared) → the hotel row → **the reservation row `FOR UPDATE`** (new lock step 2b: modify, cancel, no-show and waivers; bookings never lock existing reservations, so no cycle) → inventory rows for the **union of old and new nights**, room type then date, in one statement → approval rows → the penalty row. One change per reservation at a time.
- Inside the locks: release the old nights and take the new ones as **net counts per row** (a kept night isn't touched); check bookable ≥ the net extra on every new night (`SOLD_OUT` with alternatives as brick 4: "Deluxe King was just sold for 12 Dec. 2 Executive King rooms are free for that night."); never below 0.
- **Answering a waiver from the inbox** locks the reservation row first (looked up from the approval without a lock), then the approval row, then the approver's PIN row, so it can't deadlock with a cancel on the same reservation.
- **Counter invariant** (brick 4's test, changed): `booked` = stay nights of `confirmed` stays (and `checked_in` from brick 8); nights of cancelled and no-show stays are kept for history but don't count.
- **Tests:** a modify taking the last Deluxe King on 12 Dec races a new booking for it, 200 runs: exactly one succeeds. A cancel races a modify of the same reservation: one wins, the other gets `RESERVATION_CHANGED`. A cancel releasing the last room lets a booking waiting on the lock succeed. A modify moving Deluxe King → Standard Queen races a booking of Standard Queen → Deluxe King: no deadlocks. Double cancel with one key: one cancellation.

### Empty, error and edge cases
- **Sold out on a new night:** above; the dialog reloads counts and keeps the fields.
- **Plan doesn't sell the type** (crafted): "Bed & breakfast isn't sold for Junior Suite. Cancel and book again on another plan." (`PLAN_DOESNT_SELL_TYPE`).
- **Changed meanwhile:** `RESERVATION_CHANGED` above. **Cancelled meanwhile:** "Chiamaka Eze cancelled this booking at 11:20."
- **Price or tax rules changed meanwhile:** `PRICE_CHANGED` with the new figures.
- **Arrival passed:** Modify and Cancel hidden; crafted: "Arrival was 24 Nov 2026. Mark it as a no-show." (`ARRIVAL_PASSED`). **No-show too early** (crafted): "VI-2611-0483 arrives on 9 Dec 2026. It can't be a no-show yet." (`NOT_ARRIVED_YET`).
- **Reasons missing:** "Pick a reason for cancelling." · "Say why you're waiving the penalty." · "Give a reason for booking through the min stay."
- **Waiver without permission or approval** (crafted): "Waiving needs a manager. Ask for approval." (`WAIVER_NEEDS_APPROVAL`, data `canAsk: true`).
- **Penalty no longer open:** "This penalty was already waived by Tunde Bello at 00:41." (`PENALTY_NOT_OPEN`).
- **Discount over the limit on modify:** "15% is over your 12% discount limit. A manager with a higher limit can approve it, or price the new night without the discount."
- **Shorter stay below the meal allocation or min stay, zero-night stay:** brick 4's messages; departure must be after arrival.
- **Company-guaranteed stays** (seeded Acme bookings): the penalty is recorded the same way; "Charged to Acme Energy Ltd" comes with brick 12.
- **Penalty ₦0.00** (a 0% policy): no penalty recorded, "No penalty under this booking's terms."
- **Idempotency key reused with a different change:** "This change was already saved." with the result.
- **Long reasons and names:** truncate in rows with a tooltip; full on the detail.
- **Archived plan or room type after booking:** kept nights are unaffected; new nights on an archived plan: "Bed & breakfast was archived, so new nights can't be priced. Keep the dates or cancel and book again."

## Behind the scenes
- **Folio postings:** none in this brick. A penalty is recorded **to charge** on `penalties`; brick 10 posts each one as a penalty charge on the reservation's folio on the penalty's business date (applying any deposit held) and marks it `charged`. Brick 4's deposit due on a cancelled reservation stops being due; refunding money received is brick 10.
- **Night audit (brick 13):** lists arrivals not checked in and links to **Mark no-show**; expires open approvals; posts nothing for cancelled or no-show stays. Brick 13 decides whether arrivals left unmarked are marked by the audit with this same service.
- **Ledger:** none until Stage 5 (penalty revenue by department from the postings).
- **Jobs:** none new; brick 5's `approvals.expire` covers the new kinds. No ARI pushes until channels (Stage 4), which read the same inventory rows after commit.
- **Notifications:** in app only (brick 5's bell for waiver and discount requests; the requester sees the answer on the detail within seconds). No guest messages: the desk copies the confirmation or cancellation into WhatsApp.
- **Stage 4:** OTA modifications and cancellations (matched by channel reference, prices from the channel, may go past the overbooking limit and be flagged, decision 0007) and guest-app changes (`guest-stay.md`) call the same change service.
- **Data import (brick 17):** only future `confirmed` reservations are imported, with their terms snapshot (from the file or the plan) so cancel and no-show apply the right policy. Past cancellations, no-shows and penalties stay in the old system; penalties already owed come in as folio or city ledger opening balances.
- **Code layout:** `apps/api/src/reservations/change/` (quote-change, modify, cancel, no-show, penalty maths), `apps/api/src/approvals/kinds/penalty-waiver.ts` and `modify-discount.ts`; pure maths (kept vs new nights, the late-change penalty, the passed-deadline rule) in `@vento/shared` so the dialog matches the server. Web: `components/reservations/` (`ModifyDialog`, `CancelDialog` with its no-show variant, `PenaltyCard`).
- **Decision 0028 (proposed, if Open question 4 is answered as recommended):** a `penalty_waiver` approved in the inbox is applied in the approver's transaction, because the penalty it binds to is already recorded and can't change; the same-screen path still uses it inside the cancel. Every other kind keeps decision 0027's "the requester completes the action".

### Data model sketch
All with `id` (UUID v7), `organizationId`, `createdAt`, `updatedAt`; money `numeric(14,2)` with `currency` (`NGN`).

| Table | Columns (beyond the above) | Keys and checks |
|---|---|---|
| `reservations` (existing) | + `endedAt`, `endedByMemberId`, `endedByName`, `endReason` (`guest_request`, `company_request`, `deposit_not_paid`, `duplicate`, `other`, null for no-show), `endReasonText`, `endNote`; status adds `cancelled`, `no_show` | |
| `stays` (existing) | + `version` (int, default 1), status adds `cancelled`, `no_show`; `cancellationDeadline`, `terms.penaltyAmount`, `quotedTotal` updated by modify | |
| `stay_nights` (existing) | removed nights deleted, new nights inserted, kept rows untouched, all under the change's locks (before/after in the audit event and `reservation_changes`) | |
| `reservation_changes` | `propertyId`, `reservationId`, `stayId`, `kind` (`modify`, `cancel`, `no_show`, `waive`), `idempotencyKey`, `requestHash`, `before`, `after` (jsonb), `businessDate`, `byMemberId`, `byName`, `deviceId` | unique (`organizationId`, `idempotencyKey`); index (`reservationId`), (`propertyId`, `businessDate`) |
| `penalties` | `propertyId`, `reservationId`, `stayId`, `changeId`, `kind` (`late_cancellation`, `late_change`, `no_show`), `amount`, `currency`, `basis` (jsonb: policy, nights used, deadline), `businessDate`, `status` (`to_charge`, `waived`; `charged` from brick 10), `waivedAt`, `waivedByMemberId`, `waivedByName`, `waiverReason`, `waiverBusinessDate`, `approvalId`, `approverMemberId`, `approverName` | index (`propertyId`, `status`), (`propertyId`, `businessDate`), (`reservationId`); check `amount > 0`; check waived columns set only when `status = 'waived'` |
| `approvals` (existing) | kinds add `penalty_waiver`, `modify_discount`; `usedEntityType` adds `penalty`, `reservation_change` | |

### API procedures (oRPC, contracts in `@vento/shared`)
| Procedure | Input → output | Permission |
|---|---|---|
| `reservations.quoteChange` | reservation, stay, version, arrival, departure, room type, adults, children, discount (keep / none / new / keep on kept nights only) → nights (kept or new, plan and sold price, tax lines), totals before and after, difference, deposit before and after, deadline and penalty after, late-change penalty, rooms left per new night, room types offered, breaks, discount check, `changeHash` | `reservation.manage` |
| `reservations.modify` | idempotency key, reservation, stay, version, the fields above, `changeHash`, restriction reason?, `approvalId?` (discount), waive? {reason, `approvalId?`} → reservation | `reservation.manage` (+ `stay.rate_override`, `penalty.waive` or approvals) |
| `reservations.endQuote` | reservation, mode (`cancel` / `no_show`) → allowed?, policy in words, deadline, penalty (amount, basis) or none and why, nights to release | `reservation.manage` |
| `reservations.cancel` | idempotency key, reservation, version, reason, reason text?, note?, waive? {reason, `approvalId?`} → reservation | `reservation.manage` (+ waiver rules) |
| `reservations.markNoShow` | idempotency key, reservation, version, note?, waive? → reservation | `reservation.manage` (+ waiver rules) |
| `penalties.waive` | idempotency key, penalty, reason, `approvalId?` → penalty | `penalty.waive`, or an approval |
| `approvals.*` (brick 5) | kinds `penalty_waiver` (action: the cancel / no-show / modify input, or a penalty id) and `modify_discount` | as brick 5 |
| `reservations.get`, `reservations.list` (changed) | + status `cancelled` / `no_show`, end details, penalties, allowed actions | readers |

Error codes: `RESERVATION_CHANGED`, `NOT_CHANGEABLE` (status), `ARRIVAL_PASSED`, `NOT_ARRIVED_YET`, `NOTHING_CHANGED`, `PLAN_DOESNT_SELL_TYPE`, `CANCEL_REASON_REQUIRED`, `WAIVER_REASON_REQUIRED`, `WAIVER_NEEDS_APPROVAL` (`canAsk`), `PENALTY_NOT_OPEN`, plus brick 4's `SOLD_OUT`, `PRICE_CHANGED`, `DISCOUNT_OVER_LIMIT`, `RESTRICTION_REASON_REQUIRED`, `PAST_DATE`, `TOO_FAR_AHEAD`, `STAY_TOO_LONG`, `TOO_MANY_GUESTS`, `IDEMPOTENCY_CONFLICT`, brick 5's approval codes, `PROPERTY_NOT_FOUND`, `PROPERTY_ARCHIVED`, `FEATURE_OFF`.

### Demo seed
Added to the Kora seed through the change service (dates relative to D = 25 Nov 2026; numbers illustrative, the seed prints the real ones).
- **Kora Victoria Island**
  - **Modified:** one of Chiamaka's bookings extended by a night on D−2 (Activity shows "Changed"); the 15% approved booking from brick 5 moved to a later date by Sade on D−1 (kept nights, new nights re-quoted).
  - **Cancelled:** one free (Guest request, Chiamaka, D−3); one late with penalty **to charge** (Non-refundable Deluxe King, full stay ₦496,125.00, Chiamaka, D−1); one late **waived by Tunde directly** (GM, "Hotel's error: wrong dates taken by phone", D−2); one late **waived after Ibrahim asked Tunde in the inbox** (approval used, D−1).
  - **No-show:** one with arrival D−1, marked by Ibrahim at night with penalty **to charge**.
  - **For the owner to try on D:** VI-2611-0447 Mr Kelechi Obi (Executive King, Best available, D+1 → D+3, deadline passed), VI-2611-0391 (Standard Queen, D → D+2, arriving today) and VI-2611-0405 (Deluxe King, D → D+1, note "Abuja flight cancelled, guest called 21:30"), all among brick 4's arrivals and guaranteed by a deposit rule. Ms Collins's booking is made in review.
- **Kora Ikeja GRA:** one late cancellation **waived by Sade**, so the owner's All hotels view has two hotels' waivers.
- The seed test asserts statuses, penalties (to charge and waived), the approvals, the audit events with `exception: 'penalty_waived'`, and the counter invariant after seeding.

### Owner's review (what to try)
1. As Chiamaka on FD-VI-01 (PIN): book Ms Collins as in brick 4, then **Modify** → Leave 13 Dec: "+1 night", "new night at today's rate", ₦823,200.00, **Save · +₦205,800.00**; Activity shows the change. Try **Room type** Executive King: every night re-priced and the list shows only types Bed & breakfast sells.
2. Open Chiamaka's 15% booking (approved by Tunde) and extend it: **Ask for approval · 15%** or **Price new nights without the discount**.
3. **Cancel** VI-2611-0447: Guest request → ₦257,250.00 penalty to charge. On another late booking, tick **Waive the penalty** → Ask to waive → Tunde's PIN (5072) → cancelled and waived.
4. On VI-2611-0405: ⋯ → **Mark no-show** → waive → **Send to Tunde's inbox**. In a second browser as `tunde@kora.example`: bell → approve with PIN. The first browser shows "Waived" within seconds.
5. Move a free-cancellation booking's dates after its deadline has passed (any booking arriving tomorrow): the deadline stays passed. Shorten a Non-refundable seeded booking: the late-change penalty shows before saving.
6. Two windows, last Deluxe King on a night: extend one booking onto it while booking it in the other: one succeeds.
7. As `adaeze@kora.example`, All hotels: the list's Status filter shows cancelled and no-show rows at Kora Victoria Island and Kora Ikeja GRA. Turn off the network: Modify and Cancel are disabled with their reason.

## Changes needed in `docs/DOMAIN.md`
1. **Reservation** row, notes: add "At the desk, a `confirmed` reservation is modified while its arrival is on or after the business date, cancelled with a reason, or marked `no_show` from its arrival business date (brick 6). Cancelled and no-show reservations keep their nights for history but hold no rooms; there is no un-cancel (book again)."
2. **Stay** row, notes: add "A **modify** keeps each unchanged night's plan and sold price; new nights (new dates, or every night when the room type changes) are priced from the same plan at its current price. The plan can't change. The terms snapshot is kept; the cancellation deadline, penalty amount and deposit due are recomputed from it, and a deadline that has passed stays passed. `version` rises with each change."
3. **Cancellation policy** row, notes: replace "Penalty posts as a charge when applied." with "The deadline is a clock time. After it (or always on a non-refundable plan) a guaranteed stay's cancellation records a **penalty** from the stored terms; unguaranteed stays are released without one. Recorded **to charge** in Stage 1 brick 6, posted as a charge from brick 10. After the deadline, a change that lowers the stay total records a late-change penalty: the policy applied to the drop (Open question 2)."
4. **No-show** row: "A `confirmed` stay not checked in by the night audit of its arrival date. Marked by the desk from its arrival business date (brick 6), or listed for marking at night audit (brick 13). Costs the late-cancellation penalty in its terms when guaranteed; every night is released."
5. New terms (Reservations & front desk): **Penalty** ("What a late cancellation, late change or no-show costs under the stay's terms: amount, basis, business date; status `to_charge → charged` (brick 10) or `waived`.") and **Penalty waiver** ("Removing a whole penalty, with a reason, by someone with `penalty.waive` or with their approval (kind `penalty_waiver`); an exception in the owner's daily report.").
6. **Permissions matrix:** row "Create / modify reservation" becomes "Create, modify or cancel a reservation; mark a no-show". Paragraph adds: "Waiving a penalty has no limit; without the permission, a member asks someone who has it (approval kind `penalty_waiver`, approvers ordered revenue manager, GM, group admin, owner). A discount carried onto new nights or changed on a modified stay is measured against the limit of the person saving the change (kind `modify_discount`)."
7. **Approval** row: kinds add `penalty_waiver` and `modify_discount` (brick 6); "A waiver approved in the inbox is applied in the approver's transaction (decision 0028)" if Open question 4 is answered as recommended.
8. **Availability** row: "`booked` counts the nights of `confirmed` (and `checked_in`) stays only."
9. **Exception** list: add "**penalty waived** (`reservation.penalty_waived` with `exception: 'penalty_waived'` and `liveProperty: true`): every waived penalty, with requester, approver, amount and reason". Answers the open question in `night-audit.md` and `owner-morning.md`.
10. **Audit event** row and reports catalogue: no change.

## Changes needed in walkthroughs (product-manager, same change as the build)
- `front-desk-morning.md`, new step **6c. 11:10 Guest adds a night**: "*Does:* Ms Collins calls to stay until 13 Dec. Chiamaka opens VI-2611-0483, Modify, sets Leave to 13 Dec, saves. *Sees:* '+1 night', 'Sat 12 Dec · new night at today's rate ₦168,000.00', ₦617,400.00 → ₦823,200.00*, 'Deluxe King is free on 12 Dec'. *Behind the scenes:* one transaction locks the reservation and Deluxe King for 12 Dec, adds one booked room, keeps 9–11 Dec at their stored prices and prices 12 Dec at today's Bed & breakfast rate; audit event `reservation.modified`. About 25 seconds."
- New step **6d. 11:20 Late cancellation**: "*Does:* Mr Obi cancels VI-2611-0447 (Executive King, 26–28 Nov); free cancellation ended 24 Nov, 14:00. Chiamaka picks Guest request and cancels. *Sees:* 'Penalty: first night · ₦257,250.00*', then Cancelled with the penalty to charge. *Behind the scenes:* both nights released under the inventory lock; `reservation.cancelled` and `penalty.recorded`; the penalty is charged from the deposit once folios arrive (brick 10). If Tunde agrees to waive it, he enters his PIN on her screen and the owner sees 'Penalty waived … Approved by Tunde Bello' tomorrow."
- "What can go wrong": add "**Guest wants a night that's sold out:** 'Sold out 12 Dec' on the Leave field; nothing changes." and "**Waiver without a manager nearby:** she cancels now and sends the waiver to Tunde's inbox; the penalty shows 'Waiver asked' until he answers."
- "Becomes tests": add "Extending locks the new night, keeps the booked nights' prices and prices the new one at today's rate; a late cancellation records the first-night penalty; a waiver is refused for front desk alone and succeeds with Tunde's PIN, with both names in the audit event."
- `night-audit.md` step 3: *Sees* becomes "the dialog (#31): 'Policy: a no-show is charged the first night. Penalty ₦147,000.00*. 2 nights released (25 and 26 Nov).'"; *Behind the scenes* becomes "one transaction: status `no_show`, penalty recorded to charge on business date 25 Nov, Standard Queen released for 25 and 26 Nov (locked rows). From brick 10 the penalty posts with tax lines and is paid from the deposit held. Audit events `reservation.no_show`, `penalty.recorded`."
- `night-audit.md` step 4: "Ibrahim can't waive penalties, so he ticks Waive the penalty, reason 'Flight cancelled, guest called 21:30', Ask to waive, picks Tunde and sends it to his inbox. *Sees:* 'Marked no-show · Waiver asked of Tunde Bello'. At 00:41 Tunde approves from his phone with his PIN; the card turns to 'Waived · Approved by Tunde Bello'. *Behind the scenes:* the no-show and release happen at once; the waiver is applied when Tunde approves. Audit event `reservation.penalty_waived` with requester Ibrahim, approver Tunde and `exception: 'penalty_waived'`."
- `night-audit.md` "What can go wrong", "Waiver not approved": "the no-show stands with the penalty to charge; Ibrahim or the day team can ask again; once posted (brick 10) removing it is a folio correction." Open question "Is a waived no-show penalty an exception?": answered yes (brick 6). Same answer in `owner-morning.md` Open questions.
- `guest-stay.md` "Alternative path: she cancels inside the penalty window": add a Stage 1 note "Until the guest app (Stage 4), the desk cancels by phone with the same rule (`front-desk-morning.md` step 6d)." Open question "Extra deposit on modification": answered "the deposit due is recomputed from the stored rule; a larger amount is due by the rule counted from the change". Open question "Tax on the cancellation penalty": stays open (Legal checks below).

## Changes needed in `docs/design/screen-inventory.md`, `docs/design/CHANGES.md` and `docs/ARCHITECTURE.md` (with the build)
- **Inventory:** "Modify / cancel reservation (with penalty)" → built (Stage 1 brick 6; no refund line until brick 10). "Reservation detail" → Modify, Cancel and Mark no-show built.
- **CHANGES:**
  - **Modify:** "502 is free on 28 Nov" becomes "Executive King is free on 28 Nov" until rooms are assigned (bricks 7–8); the nightly line reads "new night at today's rate"; **Change rate** link and the late-change penalty box added; footer "Saved to the audit trail with your name and device." (no reason unless a discount, restriction or waiver asks for one); Save disabled until something changes.
  - **Cancel:** no **Deposit held** row until brick 10; "Charged to Acme Energy Ltd" becomes "Penalty to charge" until bricks 10 and 12; reason pills add **Deposit not paid**; the waive checkbox reads "Waive the penalty" with a required "Reason for waiving" and the button "Ask to waive ₦…" or "Cancel and waive ₦…"; primary "Cancel booking · ₦257,250.00 penalty".
  - **No-show:** the cancel dialog's variant from the ⋯ menu (no design of its own).
  - **Reservation detail:** cancelled and no-show banner and **Penalty** card (new, built from the card pattern; ui-designer to check).
- **ARCHITECTURE:** lock order gains 2b (the reservation row) and the penalty row after approvals; inbox waiver answers lock the reservation before the approval; `reservations/change/`; the two new approval kinds; decision 0028 if accepted.

## Tests (tester, with the build)
**API** (`apps/api/src/reservations/change/*.test.ts`, against the test database)
- Modify: kept nights keep stored prices after a rate change; new nights priced at today's plan price; room type change re-prices every night; guests change re-prices extra adult only; plan can't change; terms snapshot kept; deadline, penalty amount and deposit recomputed; passed deadline stays passed; late-change penalty formula for first night, N% and non-refundable; discount carried within the limit, over it refused without `modify_discount` and saved with it; restriction reason rule; `PRICE_CHANGED`, `RESERVATION_CHANGED`, `NOTHING_CHANGED`.
- Cancel and no-show: status table enforced; penalty only when guaranteed and after the deadline (13:59 free, 14:00 not; non-refundable always); every night released; no-show from the arrival business date including after midnight; `ARRIVAL_PASSED`, `NOT_ARRIVED_YET`.
- Waivers: refused for front desk without approval (`WAIVER_NEEDS_APPROVAL`); direct for GM and revenue manager; same-screen approval cancels and waives in one transaction; inbox approval applies the waiver in the approver's transaction with requester and approver on the event; declined and expired leave it to charge; self-approval refused; approver list order by role; one open request per penalty; `PENALTY_NOT_OPEN`.
- Idempotency for every procedure (same key → same result; different body → conflict); organization isolation and property scoping; PIN session only its hotel; feature switch.
- Locks: the races listed under Availability locking, 200 runs each; counter invariant after random concurrent books, modifies, cancels and no-shows; no deadlocks including inbox waiver answers racing a cancel.
- Audit events written in the same transaction (a failed change leaves none); `exception: 'penalty_waived'` and `liveProperty`.

**Web** (Vitest): kept vs new night labelling, the Save label with the difference, the late-change box, the waive checkbox's button states, copy builders for the cancellation message.

**E2E** (`apps/web/e2e/modify-cancel.spec.ts`, desktop and phone): extend Ms Collins by a night; room type change; cancel with penalty; cancel with a same-screen waiver by PIN; no-show with an inbox waiver approved in a second context; sold-out new night; offline disables. `accessibility.spec.ts` gains the Modify dialog (with the late-change box), the Cancel dialog (free, with penalty, with waiver), the no-show dialog, and the detail of a cancelled reservation with its Penalty card, light and dark, desktop and phone.

## Reports
No new reports. From the fixed catalogue:
- **No-shows & cancellations** (brick 15): reads `reservation_changes` and `penalties`: per period, each cancellation and no-show with reason, who, penalty to charge, charged or waived (and by whom).
- **Rate override & discount** (brick 15): discounts carried or changed on modify, with the approver.
- **Deposits held** (brick 10): cancelled reservations' deposits are applied to the penalty or refundable.
- **Manager's flash** and **owner's daily report** (bricks 15–16): room nights on the books from confirmed stays only; the **penalty waived** exception.

## UI copy
- Detail actions: "Cancel" · "Modify" (M) · "More" (aria-label "More: no-show") → "Mark no-show" · hidden-action notes "This booking was cancelled on 25 Nov 2026." / "Arrival was 24 Nov 2026. Mark it as a no-show."
- Modify: "Modify reservation · VI-2611-0483" · "Sarah Collins · Deluxe King · Bed & breakfast" · "Arrive" · "Leave" · "+1 night" / "−1 night" · "Room type" · "Guests" · "Sat 12 Dec · Bed & breakfast · new night at today's rate" · "Service charge, VAT, consumption tax" · "Stay total" "₦617,400.00 → ₦823,200.00" · "Deluxe King is free on 12 Dec. Same plan, no approval needed." · "Sold out 12 Dec" · "Deposit due ₦205,800.00 by 27 Nov, 10:32 (unchanged)" · "Free cancellation until 7 Dec 2026, 14:00" · "Change rate" · "Price new nights without the discount" · "Nothing to save yet" · "Save · +₦205,800.00" (↵) · "Cancel" (esc) · "Saved to the audit trail with your name and device."
- Late change: "Free changes ended 7 Dec 2026, 14:00. This change lowers the stay by ₦165,375.00, so a penalty of ₦165,375.00 applies." · "Save · ₦165,375.00 penalty"
- Cancel: "Cancel reservation · VI-2611-0447" · "Arrives tomorrow · free cancellation ended 24 Nov 2026, 14:00" · "Policy" "Best available: free until 48 h before arrival" · "Penalty" "First night · ₦257,250.00" · "Rooms" "2 nights released (26 and 27 Nov)" · "Penalty to charge" · "Reason (required)" pills "Guest request", "Company request", "Deposit not paid", "Duplicate booking", "Other" · "Note (optional)" · "Keep booking" · "Cancel booking · ₦257,250.00 penalty" · free: "Free cancellation until 7 Dec 2026, 14:00 · No penalty" → "Cancel booking" · unguaranteed: "No penalty: this booking had no deposit or guarantee."
- No-show: "Mark no-show · VI-2611-0391" · "Arrival 25 Nov 2026 · not checked in" · "Best available: a no-show is charged the first night" · "2 nights released (25 and 26 Nov)" · "Mark a no-show only when the guest won't arrive tonight." · "Note (optional)" · "Mark no-show · ₦147,000.00 penalty"
- Waiver: "Waive the penalty" · "Reason for waiving" (required) · "Waiving needs a manager. Tunde, Sade or Adaeze can approve it." · "Ask to waive ₦257,250.00" · "Cancel and waive ₦257,250.00" · "Mark no-show and waive ₦183,750.00" · prompt "Waive penalty ₦257,250.00 on VI-2611-0447 · Kelechi Obi" · "Chiamaka can't waive penalties. Asked at 11:21 on FD-VI-01." · "Approve waiver and cancel" / "Approve waiver and mark no-show" / "Approve waiver" (inbox) · "Not nearby? Cancel now and send the waiver to Tunde's inbox" / "Not nearby? Mark no-show now and send the waiver to Tunde's inbox"
- Penalty card: "Penalty" · "₦257,250.00 · First night" · badges "To charge", "Waiver asked", "Waived" · "Waiver asked of Tunde Bello · expires 11:51" · "Waived · Approved by Tunde Bello · “Regular guest, rebooking for January”" · "Waived by Tunde Bello · “…”" · "Tunde Bello declined: “Policy applies for this rate”" · "Waive penalty" · "Ask to waive" · "Ask again"
- Banner: "Cancelled 25 Nov 2026, 11:20 by Chiamaka Eze · Guest request · “Meeting moved to January”" · "Marked no-show 26 Nov 2026, 00:35 (business date 25 Nov) by Ibrahim Musa" · "Rate per night · as booked"
- List: badges "Cancelled", "No-show" · Total "₦257,250.00 penalty" / "Waived" / "No penalty"
- Inbox and bell (brick 5 patterns): "Penalty waiver waiting for you" · "Waiver · Kora Victoria Island" · "Waive ₦183,750.00 · VI-2611-0405" · "Ibrahim Musa · No-show · 3 min" · detail "Reason" "“Flight cancelled, guest called 21:30”" · "Policy" "Best available: a no-show is charged the first night"
- Toasts: "VI-2611-0483 changed · Copy confirmation" · "VI-2611-0447 cancelled" · "VI-2611-0447 cancelled · penalty waived" · "VI-2611-0391 marked no-show" · "Waiver sent to Tunde Bello" · "Penalty waived" · "Cancellation copied"
- Errors: "Deluxe King was just sold for 12 Dec. 2 Executive King rooms are free for that night." · "Sade Bakare changed this booking at 11:08. Check the new details." · "Chiamaka Eze cancelled this booking at 11:20." · "The price changed since you opened this: Bed & breakfast is now ₦175,000.00 a night for 12 Dec. Check the new total with the guest and save again." · "Bed & breakfast isn't sold for Junior Suite. Cancel and book again on another plan." · "Arrival was 24 Nov 2026. Mark it as a no-show." · "VI-2611-0483 arrives on 9 Dec 2026. It can't be a no-show yet." · "Pick a reason for cancelling." · "Say why you're waiving the penalty." · "Waiving needs a manager. Ask for approval." · "This penalty was already waived by Tunde Bello at 00:41." · "15% is over your 12% discount limit. A manager with a higher limit can approve it, or price the new night without the discount." · "This change was already saved." · "Bed & breakfast was archived, so new nights can't be priced. Keep the dates or cancel and book again."
- Offline: "Changing a booking needs a connection." · "Checking whether VI-2611-0447 was cancelled…"
- Permission denied: "Only front desk, revenue managers, GMs and the owner can change reservations. Ask your GM."
- Cancellation (copied): "Kora Victoria Island: Hello Kelechi, your booking VI-2611-0447 for Executive King, 26–28 Nov 2026 is cancelled. Under the booking's terms a cancellation charge of ₦257,250.00 applies. Questions? WhatsApp us on {front desk number}." Free or waived: "… is cancelled. There is no charge." Company-guaranteed: the charge sentence is left out (never mention what a company owes to the guest).
- Owner's daily report line (brick 16): "Penalty waived · VI-2611-0405 Deluxe King · No-show · ₦183,750 · Ibrahim Musa · Reason: flight cancelled, guest called 21:30 · Approved by Tunde Bello"

## Out of scope
- Changing the **rate plan** on a booking (cancel and book again); **un-cancelling** or un-marking a no-show (book again); cancelling one room of a multi-room reservation (brick 14).
- **Posting** penalties, applying deposits and refunds (brick 10); routing penalties to a company (brick 12); automatic no-show marking at night audit (brick 13).
- In-house changes: extend, leave early, room moves (bricks 7–8).
- **Partial waivers** or reducing a penalty to another amount; a waiver limit by amount (the matrix has none).
- Auto-release of unpaid-deposit bookings (brick 4 Decision 1 stands: the agent cancels with **Deposit not paid**).
- Sending modification or cancellation messages by WhatsApp, SMS or email (Stage 4); guest-app and OTA changes (Stage 4, same service).
- Room assignment shown in the Modify dialog ("502 is free"), until bricks 7–8.
- ⌘K entries ("Modify reservation", "Cancel reservation"): with the command palette brick.

## Open questions for the owner (answered)

All four answered as recommended (owner, 2026-11-27): unchanged nights keep the agreed price and new nights use the same plan at today's rate; a late shorten or downgrade carries the policy on the drop, waivable; a discount carries to new nights within the saver's limit; an inbox waiver applies when approved (decision 0028).

1. **What price does a modified stay get?** Recommended: **unchanged nights keep the price the guest agreed; new nights (and every night if the room type changes) are priced from the same plan at today's rate; the plan itself can't change.** Why: the guest is never surprised on nights already agreed, new nights can't be sold below today's rate, and blocking plan switches stops a Non-refundable booking escaping its penalty.
2. **After the free-cancellation deadline, what does shortening or downgrading cost?** Recommended: **the policy applied to the drop in the stay total (first night at most, N% of the drop, or all of it on Non-refundable), shown before saving and waivable like a cancellation.** Why: without it, "shorten to one night" quietly undoes a late cancellation or a Non-refundable booking, and the owner never sees it.
3. **Does an existing discount carry to new nights?** Recommended: **yes, at the same %, but it counts as a discount given by the person saving the change, so above their limit it needs an approval (or they price the new nights without it).** Why: guests expect the same deal for the extra night, but a GM-approved 30% must not stretch to ten more nights on a desk agent's say-so.
4. **When a manager approves a waiver from the inbox, does it apply at once?** Recommended: **yes: the cancel or no-show is saved straight away (rooms released) and the waiver applies the moment the manager approves; at the desk, PIN approval does both in one step.** Why: the penalty is already fixed so nothing can change after approval, and the night auditor shouldn't have to come back to finish it (this extends decision 0027 for waivers only, as decision 0028).

**Legal checks (not owner decisions):** whether a cancellation or no-show penalty attracts VAT, Lagos consumption tax and service charge, and on what base, must be confirmed by finance or legal under the Nigeria Tax Act 2025 and the Lagos law before brick 10 posts penalties (this brick records only the gross amount the guest was told). Whether advertised cancellation terms must be shown to the guest in a set form under consumer protection rules (FCCPA) is to verify before the guest-facing confirmation wording is fixed. No new personal data is collected; cancellation reasons and notes are internal and never sent to processors.
