# Approvals

- **Status:** approved (owner, 2026-11-27: all four open questions answered as recommended)
- **Stage:** 1 (brick 5 of the plan in [stage-1-plan.md](stage-1-plan.md)). Depends on brick 4 (the booking service, `priceStay` and its hash, `requireDiscountAllowed`, the New reservation sheet) and Stage 0 bricks 6 and 10 (`requireWithinLimit`, `recordAudit`, member PINs, registered devices, PIN sessions). Feeds brick 6 (penalty waivers reuse the mechanism), brick 8 (walk-in discounts use the same prompt), bricks 10 and 12 (refunds, voids, credit limit), brick 13 (night audit expires open approvals), bricks 15–16 (discount report and owner's daily report show the approver).
- **Module:** Platform (approvals are shared by every module), wired to Reservations & Front Desk only in this brick.
- **Walkthroughs:** `front-desk-morning.md` new step 6b, "What can go wrong" and "Becomes tests" (changed, listed under "Changes needed in walkthroughs"). Read later by `front-desk-morning.md` step 8 (walk-in, brick 8), `night-audit.md` step 3 (waiver, brick 6), `waiter-dinner-service.md` (POS, Stage 3), `owner-morning.md` (report line, brick 16).
- **Screens:** Approval prompt (#22: `ApprovalPOS.dc.html`, `ApprovalPOSDark.dc.html` for the layout; the desk version of the same panel in `ReservationDetail.dc.html` with `dialog`, shown by `ReservationDetailAfter.dc.html`; `ApprovalPhone.dc.html` for the approver on a phone). Approvals inbox (#29: `Inbox.dc.html` view `approvals`, `InboxApprovals.dc.html`, `InboxApprovalsDark.dc.html`, `InboxApprovalsM.dc.html`; bell `InboxBell.dc.html`; states `InboxEmpty`, `InboxError`, `InboxLoading`, `InboxOffline`, `InboxOfflineM`). Not this brick: the Notifications view and its other alert types (`InboxNotifications*.dc.html`), the "What each role is alerted about" table.
- **Decisions:** `0008-permission-limits-approvals-audit.md`, `0018-permissions-and-audit-in-practice.md` (approval plugs into `requireWithinLimit`), `0022-shared-devices-and-pin.md` (PIN counter and lockouts reused), `0023-two-step-sign-in.md` (approval by PIN moved to Stage 1), `0024-offline-shell-first.md`, `0025-jobs-logs-and-error-tracking.md` (the expiry job). Proposed: **0027 · Approvals are single-use, bound to the exact action, and confirmed by the approver's PIN** (architect writes it with the build; content under "Behind the scenes").

## Problem
When a guest on the phone asks for 15% and the agent's limit is 12%, today she has two bad options: say no and maybe lose the booking, or hand the keyboard to the GM to make the booking himself, so the record shows his name and nothing shows that the desk asked. In most Nigerian hotels the "approval" is the GM saying "go ahead" across the lobby or on WhatsApp, and the owner never learns who agreed to what. Brick 4 closed the leak by refusing any discount over the limit, which is a dead end at the desk. The agent needs the GM's yes, on her screen or from his phone, recorded with both names, for exactly that booking and nothing else.

## Persona and job
- **Front desk agent** (Chiamaka Eze, shared front desk PC FD-VI-01, PIN session, limit 12% in the demo): a few over-limit requests a week, usually with a guest on the line or at the counter. Needs a yes or no in seconds when the GM is nearby, and within minutes when he isn't, without retyping the booking.
- **GM** (Tunde Bello, limit 50%): walks to the desk and enters his PIN, or answers from his phone in the office or at home. Needs to see what he is approving (guest, stay, plan price, new price, total, reason) in one glance.
- **Revenue manager** (Sade Bakare, 25%) and **owner** (Mrs Adaeze Okafor, any): approve when the GM can't, and ask the owner when they go past their own limit.
- **Owner**: next morning, every discount shows who gave it and who approved it (brick 16).

## Success looks like
- Same-screen approval adds **under 15 seconds** to a booking: from "Ask for approval" to booked is 3 clicks plus a 4-digit PIN.
- Inbox approval: the approver goes from the bell to approved in **2 taps plus the PIN** on a phone; the requester sees the answer **within 5 seconds** without touching anything.
- **Zero** over-limit discounts without an approver, and **zero** self-approvals (server tests; the UI hiding is cosmetic).
- An approval is used **once**, only for the priced stay it was given for, only by the member who asked, at that hotel, before it expires (server tests, including a 200-run race of two bookings on one approval).
- Every approved discount's audit event carries the approver (`approverMemberId` filled), and the approver's limit is re-checked when the approval is given and again when it is used.

## User flow
Chiamaka Eze, FD-VI-01 at Kora Victoria Island, 25 Nov 2026 at 10:36, business date 25 Nov 2026. Ms Sarah Collins (from brick 4's discount variant) asks for 15% off Deluxe King, Bed & breakfast, 9–12 Dec.

**Same screen (Tunde is in the back office, 10 metres away)**
1. On **Room & rate**, **Change rate**, Discount **15**, reason **Repeat guest**, note "Stayed 4 times this year". Inline, amber: "15% is over your 12% discount limit. A manager with a higher limit can approve it when you book." **Continue** stays enabled. Summary: ₦168,000.00 → ₦142,800.00 a night · 15% off Bed & breakfast · Total ₦524,790.00 · Deposit due ₦174,930.00.
2. Guest and Review as in brick 4. On **Review & book** the primary button reads **Ask for approval · 15%** instead of Book (click 1).
3. The **approval prompt** opens (dialog on desktop, bottom sheet on phones). Left: "Needs a manager", "Discount 15% on Deluxe King · Bed & breakfast", "Chiamaka's limit is 12%. Asked at 10:36 on FD-VI-01."; the figures (Plan price ₦168,000.00 a night · Discount 15% − ₦25,200.00 a night · New rate ₦142,800.00 a night · Stay total incl. taxes ₦617,400.00 → ₦524,790.00); "Reason from Chiamaka: Repeat guest · Stayed 4 times this year"; **Approving manager** pills: Sade Bakare · Revenue manager, Tunde Bello · General manager, Adaeze Okafor · Owner (Chiamaka is never listed). Right: the PIN pad.
4. Tunde walks over and taps **Tunde Bello** (click 2). The pad says "Tunde, enter your PIN". He types 4 digits (dots only).
5. **Approve 15% and book** (click 3). The server checks his PIN and his limit, records the approval bound to this exact priced stay, and the booking runs with it in the same flow. The sheet closes on the reservation detail: "Sarah Collins · Confirmed · VI-2611-0484"; Rate card line "Plan price ₦168,000.00 · 15% discount, Repeat guest (Chiamaka Eze) · Approved by Tunde Bello". Toast "Booked VI-2611-0484 for Sarah Collins". Chiamaka stays signed in throughout.

**Inbox (Tunde is out of the building)**
3a. In the prompt, Chiamaka taps **Tunde Bello**, then **Not nearby? Send to Tunde's inbox** (clicks 2–3). The prompt closes; Review shows "Waiting for Tunde Bello · asked 10:36 · expires 11:06" with **Cancel request**; the button reads **Waiting for approval** (disabled). Toast "Sent to Tunde Bello".
4a. Tunde's phone (signed in with his password) shows a badge on the bell within 30 seconds. He taps the bell, then the row "15% discount waiting for you · Chiamaka Eze · Sarah Collins" (tap 1). The request card shows the same figures and reason, with the PIN pad inline (`ApprovalPhone`). He enters his PIN and taps **Approve discount** (tap 2). Toast "Approved 15% for Sarah Collins".
5a. Within 5 seconds Chiamaka's Review shows emerald "Approved by Tunde Bello at 10:39" and the button **Book · ₦524,790.00**; toast "Tunde Bello approved 15%". She books (click 4). Same detail and audit as the same-screen path.

**If her session locked while waiting** (5 minutes idle on the shared PC): she signs in again with her PIN; the bell shows "Your requests: Tunde approved 15% for Sarah Collins" → **Continue booking**, which reopens the sheet at Review with the booking as she left it. One click, then Book.

**Declined:** Tunde types "Max 12% this week" and taps **Decline**. Chiamaka sees "Tunde Bello declined 15%: “Max 12% this week”" and **Change discount**, which takes her back to Room & rate with the field focused.

## Acceptance criteria

### Main path
**What this brick delivers**
1. A **generic approval mechanism** on the server: request, approve (here by PIN, or from the inbox), decline, cancel, expire, use once. Approval kinds are registered in code; this brick registers one, `stay_discount`.
2. The **approval prompt** (`ApprovalPrompt`, reusing the lock screen's `PinPad`) wired to over-limit discounts on **New reservation**.
3. The **approvals inbox** (`/approvals`) and the **bell** in the top bar, both following the hotel switch.
4. `reservations.create` accepting an approval per stay; `stay.discount_applied` carrying the approver.
5. Demo seed approvals and the owner's review steps.

**Over the limit on New reservation** (replaces brick 4's dead end)
- Room & rate: the over-limit message changes to the copy above and **Continue** is enabled once a reason is picked. The discount rules from brick 4 (not above the plan, not ₦0, not below the meal allocation) still block.
- Review & book: when the quote says the discount is over the member's limit (`discountCheck.within = false`), the primary button is **Ask for approval · 15%**. Pressing it opens the prompt. A member without `stay.rate_override` at all can't ask (brick 4's "You can't give discounts. Ask a manager to make this booking." stands).
- Going back and changing anything that changes the price (dates, guests, room type, plan, discount) cancels a pending request ("Request to Tunde cancelled") and drops an approval that no longer matches; Review then shows **Ask for approval** again. Changing the guest, source or notes keeps it (they aren't part of the price).

**Who can approve** (server rule, checked when the approver list is built, when the approval is given, and when it is used)
- A member of the same organization who **works at the hotel** (given it, or whole-group access), is not removed, and has the kind's permission (`stay.rate_override`) with a limit **at or above the requested value** (no limit = any).
- **Not the requester.** Refused on the server whatever the client sends (`SELF_APPROVAL`).
- Has a **PIN** set that doesn't need a manager's reset.
- The list is ordered by the lowest limit that covers the request, then name (Sade 25%, Tunde 50%, Adaeze any), so the owner isn't the first ask. Nobody is pre-selected unless there is only one, so a PIN is never typed under someone else's name.
- Nobody eligible: "Nobody at Kora Victoria Island can approve 15% right now. Use up to 12%." (also shown when the only people with a high enough limit have no PIN: "Approvers need a PIN. Tunde Bello hasn't set one yet.").

**Approve here, by PIN**
- Offered only on a **registered device** (the request carries the device cookie, decision 0022). On a personal device the PIN pad isn't shown; the prompt says "Approvers enter their PIN on a shared hotel device. From here, send the request to their inbox." (Open question 4.)
- The PIN is checked with the lock screen's rules and **the same counter** (`member_pins`): 5 wrong tries lock that PIN for 15 minutes (`pin.locked`), 3 lockouts need a manager's reset. Wrong tries at the prompt and at the lock screen add up. The approver must work at the device's hotel.
- A right PIN creates the approval as `approved` (method `pin_here`), bound to the priced stay; the client then sends the booking with it at once. The requester's session is unchanged; no session is created for the approver.
- If the booking then fails (sold out, price changed), the approval stays usable for its 30 minutes for the same priced stay; any change that alters the price needs a new one.

**Ask in the inbox**
- **Send to {name}'s inbox** needs a picked approver (Open question 2). It creates a `pending` request with an idempotency key (a double tap or retry returns the same request).
- The request stores what the approver sees (the **subject**: hotel, guest name, room type, plan, stay, nights, plan price and new price per night, discount, totals before and after incl. taxes, deposit after, reason and note, requester and limit, device) and, for the requester only, the **draft** needed to resume the booking (the `reservations.create` input including its idempotency key). The draft is never returned to anyone else and is cleared when the request closes (used, declined, cancelled, expired).
- The requester's Review polls the request every 3 seconds while it is pending and the tab is visible. These polls, and the bell's, are **background reads that don't count as activity** for the PIN session idle timer, so a waiting shared PC still locks after 5 minutes.
- Only the addressed approver can answer it. **Approve** needs their PIN (from any session: password on their phone, or a PIN session on a shared device), the eligibility rule above, and the same PIN counter. **Decline** needs a comment. The requester can **Cancel request** while it is pending. Approve, decline and cancel take the request's row lock; the first to commit wins and the others get "Chiamaka cancelled this request at 10:40." / "You already answered this request."
- **Continue booking** (bell and Asked by you) is shown to the requester for their own pending or approved, unused requests at the hotel they're signed in to; it reopens New reservation at Review from the stored draft, with the request's state.

**Expiry** (Open question 3)
- A pending request expires **30 minutes** after it was asked; an approved one expires **30 minutes** after it was given if unused. Either also expires when the hotel's business date moves on. Expired is shown the moment the time passes (reads compare the time) and stored by the expiry job.
- Requester: "Tunde didn't answer by 11:06. Ask again or change the discount." → **Ask again** (a new request) or **Change discount**. Approver opening an expired request: "This request expired at 11:06." No buttons.

**Using an approval at Book** (inside brick 4's booking transaction)
- Each stay may carry an `approvalId`. With a discount over the requester's limit and no approval: refused with `DISCOUNT_OVER_LIMIT` as in brick 4 (data adds `canAsk: true`).
- With an approval, after pricing the stay and before taking the reservation number, the service locks the approval row (`FOR UPDATE`) and checks: same organization and hotel; kind `stay_discount`; status `approved` and not used; not expired (time and business date); requested by the acting member; its binding hash equals the stay's priced hash (`priceStay().hash`: plan prices, discount, sold prices, tax lines, totals, deposit amount, cancellation); and the approver **still** passes the eligibility rule with their limit now. Then it marks the approval used (`usedAt`, reservation and stay ids) in the same transaction.
- Refusals: `APPROVAL_USED` "This approval was already used for VI-2611-0484. Ask again for a new booking." · `APPROVAL_EXPIRED` "Tunde's approval expired at 11:09. Ask again." · `APPROVAL_NOT_MATCHING` "The booking changed after Tunde approved it. Ask again." · `APPROVAL_NO_LONGER_VALID` "Tunde Bello can no longer approve 15%. Ask another manager." Nothing is saved.
- An idempotent retry of the same booking (same key) returns the existing reservation, not `APPROVAL_USED`.
- If the requester's own limit has since risen to cover the discount, a sent approval is still checked and used, so the record says what happened.
- Lock order becomes: (1) the hotel's rates lock, (2) inventory rows by room type then date, (3) approval rows by id, (4) the reservation counter.

**Bell and inbox**
- **Bell** in the top bar for every signed-in member, with a count of requests **waiting for you** at the selected hotel (or every accessible hotel with All hotels); hidden count at 0. Polled every 30 seconds and on window focus. `aria-label` "Approvals, 1 waiting for you".
- Bell popover ("Notifications", approvals only in this brick): up to 5 **Waiting for you** rows (what, requester, guest, age) → **Review**; then **Your requests** of the current business date (pending, approved, declined, expired) → **Continue booking** where it applies; **See all**. No read/unread state, no "Mark all read" (nothing to mark until other alerts exist).
- **Approvals page** `/approvals` (from **See all**; no sidebar item, as in the design): title "Approvals", subtitle "Everything waiting for Tunde Bello · Kora Victoria Island". Segments **Waiting** (with count, oldest first), **Asked by you**, **Done** (answered by you, expired or cancelled, newest first). Server-paginated `{ items, page, pageSize, total }`, 50 a page. Each row: kind label ("Over limit" + hotel name), title ("Discount 15% · Sarah Collins"), amount (discount over the stay, excl. taxes, `− ₦75,600.00`), requester and age, status badge (Waiting amber, Approved emerald, Declined slate, Expired slate, Cancelled slate; "Approved · used for VI-2611-0484").
- Detail pane (desktop, split as in the design) or full card (phone, PIN pad inline as in `ApprovalPhone`): Asked by (name · device), When, Booking (room type · plan · stay), Limit (12% · front desk), Rate (₦168,000.00 → ₦142,800.00 a night), Stay total incl. taxes (before → after), the reason in quotes, **Comment** (required to decline), **Decline** and **Approve with PIN** (desktop opens a small PIN dialog; typing digits works). Footnote "Chiamaka sees your answer on her screen within seconds. Both names are kept in the audit trail."
- No filter pills while there is one kind (they come with refunds and voids). No "Related" section (needs guest history, Stage 4).

**Reservation detail**
- Rate per night card: "Plan price ₦168,000.00 · 15% discount, Repeat guest (Chiamaka Eze) · Approved by Tunde Bello".
- Activity: "Discount 15% · ₦168,000.00 → ₦142,800.00 · “Repeat guest” · Approved by Tunde Bello (PIN on FD-VI-01)" or "(inbox)".
- The audit sheet shows the approver on `stay.discount_applied`.

### Organization isolation
- `approvals` rows carry `organizationId`; every read and write filters by the organization from the auth context. An approval id, approver id or requester id from another group answers "not found"; the approver list never crosses groups.

### Property scoping
- An approval belongs to a hotel. Requests, answers and use are refused for hotels outside the member's access (`PROPERTY_NOT_FOUND`); an archived hotel's open requests can't be approved ("This hotel was archived.") and stay readable in Done.
- Approvers must work at the hotel. A PIN session sees only the device's hotel's approvals.
- **Hotel switch:** the bell count and the Approvals page are **group pages**: one hotel selected → only that hotel's requests; All hotels → every accessible hotel, each row naming its hotel (the label "Over limit · Kora Victoria Island" already does). Changing the hotel returns the page to its first page. With a New reservation sheet open and a request pending, the leave guard says "Discard this booking? Your request to Tunde is cancelled."

### Permissions, limits and approvals
No new matrix rows: approving needs **the same permission as the action, with a higher limit**, at that hotel, never for oneself. Proposed note for the matrix (`docs/DOMAIN.md`) below.
- **Ask:** the requester has the permission (`stay.rate_override`) and `reservation.manage`, and the value is over their limit. Works in a PIN session.
- **Approve:** `stay.rate_override` with limit ≥ value (seed: revenue manager 25%, GM 50%, owner / group admin any; front desk can never approve another front desk agent's request because the limit is the same), works at the hotel, has a PIN, isn't the requester. Allowed in a PIN session and on personal devices; always confirmed with the approver's own PIN.
- **Approve here:** only on a registered device of that hotel.
- Re-checked on the server at approval and at use. Behind the `front_desk` switch (the `stay_discount` kind declares its feature; other kinds will declare theirs).

### Audit events
All written with `recordAudit` in the same transaction as the change, with actor, device, property, business date and reason:
- `approval.requested` (inbox path): approval id, kind, permission, value, requester and their limit, approver asked, subject (guest name, never contact details), expires at.
- `approval.granted`: approval id, method (`pin_here` / `inbox`), approver and their limit at the time, comment; `approverMemberId` column set. For `pin_here` this is the only event (it also carries the subject and the requester, since there was no separate request).
- `approval.declined`: approver, comment (as reason).
- `approval.cancelled`: by the requester (reason "Booking changed" / "Discarded" / "Cancelled by requester").
- `approval.expired`: written by the expiry job as a system event ("Approvals"), with when it was asked and whether it was pending or approved.
- `stay.discount_applied` (brick 4's event): `approverMemberId` column set to the approver; `after` adds `approvalId`, `approverName`, `approverLimit`, `approvalMethod`. Without an approval (within the limit) unchanged.
- Wrong PINs write nothing per try (as the lock screen); a lockout writes the existing `pin.locked` with the device.

### Leakage exceptions
- No new exception type. The **discount** exception (every stay below its plan price, Decision 3 of brick 4) gains the approver. Owner's daily report line (brick 16): "Discount · VI-2611-0484 Sarah Collins · Deluxe King · 15% (₦168,000 → ₦142,800 a night, ₦75,600 over 3 nights) · Chiamaka Eze · Reason: repeat guest · Approved by Tunde Bello". Before go-live, `liveProperty: false` as now.
- Declined, cancelled and expired requests are audit facts, not exceptions; they show in the audit log and the Done list. (If pilots want "asked and declined, then booked at the limit" flagged, that is a threshold for brick 16, not this brick.)

### Offline behaviour
- Approvals need a connection: eligibility, the PIN counter and single use are only true on the server. Offline, **Ask for approval**, **Send**, **Approve** and **Decline** are disabled with "Approval needs a connection." New bookings are already blocked offline (brick 4), so nothing is queued and no approval is ever taken offline.
- The Approvals page keeps the rows loaded in this visit (memory only; guest names are never saved to the device's storage) read-only under the offline banner: "Offline since 17:32. Showing what loaded before 17:32. Approving needs a connection." Nothing loaded: "You're offline. Approvals show again when you're back."
- A request sent just before the connection dropped is retried with the same idempotency key; an approve or decline is retried only while the screen is open, and a second answer is refused politely.
- When the connection returns, the requester's waiting state resumes polling and shows whatever happened meanwhile (approved, declined, expired).

### Business date
- An approval stores the hotel's business date when asked and is valid only on that business date (and within its 30 minutes). Night audit (brick 13) expires any still open for the date it closes; until then the check at use covers it.
- After midnight, before night audit, the business date hasn't moved, so a request at 00:20 is still valid until 00:50.

### Tax lines
- Not changed. The prompt and the inbox show totals incl. taxes before and after from the same quote (`priceStay`), labelled "incl. taxes". The binding hash includes the tax lines, so a tax rule change between approval and booking makes the approval not match.

### Foreign currency
- Not relevant: approvals are in naira. The foreign equivalent stays on the booking summary only.

### Availability locking
- No change to the locks; the approval row is taken after the inventory rows and before the reservation counter (order above). An approval holds no rooms: a waiting booking can sell out, and the agent sees brick 4's sold-out message.
- **Race test:** two bookings with the same approval, synchronised at the lock, 200 times: exactly one succeeds, the other gets `APPROVAL_USED`; `booked` and stay nights reflect one booking.

### Empty, error and edge cases
- **Empty inbox:** Waiting: "Nothing waiting for you. Approvals your team asks you for show up here." · Asked by you: "You haven't asked for any approvals today. When a discount is over your limit, you can ask a manager from Review & book." · Done: "No answered requests yet." Bell empty: "Nothing waiting for you" / "You're all caught up."
- **Load error:** "Couldn't load approvals at Kora Victoria Island." → **Try again** (the design's "still reaching you on WhatsApp" isn't true yet).
- **Wrong PIN:** dots shake (respecting reduced motion) and clear; "That PIN didn't match. 2 tries left." Locked: "Too many tries. Tunde's PIN is locked until 10:51. Pick another manager or send it to an inbox." Needs reset: "Tunde's PIN needs a reset by a manager."
- **Self-approval** sent by a crafted request: "You can't approve your own discount. Ask another manager." (`SELF_APPROVAL`).
- **Approver not eligible** (crafted, or limit changed between list and PIN): "Tunde Bello can't approve 15% at Kora Victoria Island." (`APPROVER_NOT_ELIGIBLE`).
- **Approve here on a personal device** (crafted): "Approving here needs a shared hotel device. Send it to an inbox instead." (`PIN_HERE_NEEDS_DEVICE`).
- **Decline without a comment:** "Add a comment so Chiamaka knows why."
- **Answered or closed meanwhile:** "Chiamaka cancelled this request at 10:40." · "This request expired at 11:06." · "You already approved this request at 10:39."
- **Requester removed** from the hotel or the group while pending: the request can't be approved ("Chiamaka Eze no longer works at Kora Victoria Island."); it expires as usual.
- **Approver's access or limit lowered after approving:** refused at use (`APPROVAL_NO_LONGER_VALID`).
- **Price, plan, tax or business date changed after approving:** `APPROVAL_NOT_MATCHING` or brick 4's `PRICE_CHANGED`, whichever the server finds first; the agent asks again.
- **Two requests for one booking:** asking again cancels the earlier pending one for the same draft (one open request per draft).
- **Long names and reasons:** truncate with a tooltip in rows; full text in the detail. Reason up to 500 characters as in brick 4.
- **Archived hotel:** open requests can't be answered; Done stays readable.

## Behind the scenes
- **Folio postings:** none.
- **Night audit (brick 13):** expires approvals still open for the business date it closes (`approval.expired`), before rolling the date.
- **Ledger:** none.
- **Jobs:** `approvals.expire`, a pg-boss schedule every minute: marks pending and approved rows past `expiresAt` as `expired`, clears their draft and writes one `approval.expired` system event each. Idempotent (`UPDATE … WHERE status IN ('pending','approved') AND expires_at < now() RETURNING`). Reads never depend on its timing.
- **Notifications:** in app only (the bell, polled). No WhatsApp, SMS, email or push this brick; the design's "WhatsApp after 5 min" waits for the provider (DOMAIN open question).
- **Data import (brick 17):** nothing to import. Imported discounted reservations keep the old PMS's sold prices through the internal given-price path, which needs no approval (it records `approvalMethod: 'import'`).
- **Code layout:** `apps/api/src/approvals/` (service, eligibility, PIN check reusing `devices/pin-sign-in.ts`'s counter logic, the expiry job, and `kinds/stay-discount.ts`: permission, feature, how to price the input into a value, binding hash and subject). `requireWithinLimit` stays for within-limit checks; a new `useApproval(tx, access, { kind, propertyId, value, bindingHash, approvalId })` does the checks at use and returns the approver for the audit event; `requireDiscountAllowed` calls it when an approval is sent. Contracts in `packages/shared/src/contracts/approvals.ts`. Web: `components/approvals/` (`ApprovalPrompt`, inbox list and detail, bell), the booking model's states (`over_limit`, `waiting`, `approved`, `declined`, `expired`).
- **Decision 0027 (proposed):** an approval is a row, not a flag: one approver, one exact action (binding hash computed by the server from the action's own input), one use, 30 minutes, the approver's PIN every time; approve-here only on registered devices, because a 4-digit PIN is safe only behind the device secret (decision 0022), while inbox approval is protected by the approver's own session plus the PIN.

### Data model sketch
All with `id` (UUID v7), `organizationId`, `createdAt`, `updatedAt`.

| Table | Columns (beyond the above) | Keys and checks |
|---|---|---|
| `approvals` | `propertyId`, `kind` (`stay_discount`), `permission`, `value` (numeric(14,4)), `valueKind` (`percent` / `amount_ngn`), `status` (`pending`, `approved`, `declined`, `cancelled`, `expired`), `method` (`pin_here` / `inbox`), `requesterMemberId`, `requesterName`, `requesterLimit`, `approverMemberId`, `approverName`, `approverLimit` (at grant), `bindingHash`, `subject` (jsonb), `draft` (jsonb, nullable, cleared on close), `reason`, `comment`, `businessDate` (date), `requestedAt`, `expiresAt`, `answeredAt`, `usedAt`, `usedEntityType`, `usedEntityId`, `requestDeviceId`, `approverDeviceId`, `idempotencyKey` | unique (`organizationId`, `idempotencyKey`); index (`organizationId`, `approverMemberId`, `status`), (`organizationId`, `requesterMemberId`, `requestedAt`), (`propertyId`, `status`, `expiresAt`); check `approverMemberId <> requesterMemberId`; check `usedAt` only when `status = 'approved'` |

Member ids carry no foreign keys and names are snapshots (decision 0018). Not append-only (status moves), but every move is an audit event.

### API procedures (oRPC, contracts in `@vento/shared`)
| Procedure | Input → output | Permission |
|---|---|---|
| `approvals.approvers` | hotel, kind, action input → eligible people (id, name, role, initials), `canApproveHere` | the kind's permission (requester) |
| `approvals.approveHere` | hotel, kind, action input, approver id, PIN → approval (id, approver, expires at) | requester's permission; device cookie; approver checks |
| `approvals.request` | idempotency key, hotel, kind, action input, draft, approver id → approval | requester's permission |
| `approvals.get` | id → status, subject, answer; `draft` for the requester only | requester or addressed approver |
| `approvals.list` | hotel or all, view (`waiting` / `asked` / `done`), page, pageSize → `{ items, page, pageSize, total }` | signed in (own rows only) |
| `approvals.count` | hotel or all → waiting for you | signed in |
| `approvals.approve` | id, PIN, comment? → approval | addressed approver, eligibility |
| `approvals.decline` | id, comment → approval | addressed approver |
| `approvals.cancel` | id, reason → approval | requester |
| `reservations.create` (changed) | stays[].`approvalId?` | as brick 4 |

The server always prices the action input itself; the client never sends a value, hash or subject. Error codes: `DISCOUNT_OVER_LIMIT` (data adds `canAsk`), `SELF_APPROVAL`, `APPROVER_NOT_ELIGIBLE`, `NO_APPROVERS`, `PIN_HERE_NEEDS_DEVICE`, `WRONG_PIN` (`triesLeft`), `PIN_LOCKED` (`lockedUntil`), `PIN_NEEDS_RESET`, `COMMENT_REQUIRED`, `APPROVAL_NOT_PENDING`, `APPROVAL_EXPIRED`, `APPROVAL_USED`, `APPROVAL_NOT_MATCHING`, `APPROVAL_NO_LONGER_VALID`, plus `PROPERTY_NOT_FOUND`, `PROPERTY_ARCHIVED`, `FEATURE_OFF`.

### Demo seed
Added to the existing Kora seed (dates relative to D, the seed's business date). Seeded approvals are history (closed), because a pending one would expire 30 minutes after seeding.
- **Kora Victoria Island:** one reservation booked by Chiamaka at **15%** (Deluxe King, Bed & breakfast, reason Long stay) **approved by Tunde by PIN on FD-VI-01** on D−2, used; one by Ibrahim at **18%** asked in Tunde's inbox on D−1 and **declined** ("Max 12% this week"); one by Chiamaka at **14%** that **expired** on D−1. So Tunde's Done and Chiamaka's Asked by you aren't empty, and brick 16 has an approved discount to show.
- **Kora Ikeja GRA:** one reservation by Sade at **30%** (over her 25%) **approved by Adaeze in the inbox**, so the owner's All hotels view shows two hotels.
- PINs as seeded (Tunde 5072, Adaeze 8391, Sade 6294, Chiamaka 2948). Front desk limit stays 12%.
- The seed test asserts the four approvals, their audit events and the `approverMemberId` on the two discount events.

### Owner's review (what to try)
1. Register this browser as **FD-VI-01** (Settings › Devices) and sign in as Chiamaka with her PIN. New reservation → 9–12 Dec, 1 adult → Deluxe King, Bed & breakfast → Change rate 15%, Repeat guest: the amber line, Continue works → guest Sarah Collins → Review: **Ask for approval · 15%**. The list shows Sade, Tunde and Adaeze, never Chiamaka.
2. Tap Tunde, type a wrong PIN once ("That PIN didn't match. 4 tries left."), then 5072 → **Approve 15% and book**. See "Approved by Tunde Bello" on the detail and in the audit trail.
3. Book again at 15%; this time **Send to Tunde's inbox**. In a second browser (or your phone) sign in as `tunde@kora.example`: the bell shows 1 → Review → PIN → Approve. Back on the first browser, Book lights up within seconds.
4. Ask once more and decline it as Tunde without a comment (refused), then with one. Ask once more, wait 5 minutes for the PC to lock, sign back in as Chiamaka: **Continue booking** from the bell.
5. As Tunde, try to ask yourself for 60% (over 50%): you aren't in the list; Adaeze is.
6. As `adaeze@kora.example`: bell and Approvals with All hotels show Kora Victoria Island and Kora Ikeja GRA rows; switch to Kora Abuja: empty.
7. Turn off the network on the requester's browser: Ask for approval is disabled with its reason.

## Changes needed in `docs/DOMAIN.md`
1. New term in **Devices and sign-in** (or a new "Approvals" table after the permissions matrix): **Approval** — "One member's yes to one exact over-limit action by another member, at one hotel. Asked on the same screen (the approver enters their PIN on a registered device) or in the **approvals inbox** (the approver answers from their own session with their PIN). Status `pending → approved | declined | cancelled | expired`; an approved one is used once (`usedAt`). Bound to the action by a hash the server computes (for a discount: the priced stay). Expires 30 minutes after asking if unanswered, 30 minutes after approval if unused, and when the business date moves on. Kinds: `stay_discount` (Stage 1 brick 5); refunds, voids, comps, waivers and credit limit later."
2. New term: **Approvals inbox** — "Per member: Waiting (asked of you), Asked by you, Done. Follows the hotel switch. Reached from the bell."
3. **Permissions matrix** paragraph, replace "A member can't approve their own over-limit action." with: "Approving another member's over-limit action needs the same permission with a limit at or above the requested value, work at that hotel, and a PIN; it is confirmed with the approver's PIN every time, on a registered device of that hotel (same screen) or from the approver's own session (inbox). Nobody approves their own action. Limits are re-checked when the approval is given and when it is used. Asking and approving work in a PIN session."
4. **Discount on a stay**, notes: add "Over the member's limit, it needs an approval (brick 5); the stay records the approver."
5. **Exception** list, discount: add "with the approver when it was approved".
6. **Audit event** row: no change (approver is already listed).
7. Reports catalogue: no change.

## Changes needed in walkthroughs (product-manager, same change as the build)
- `front-desk-morning.md`, new step **6b. 10:36 Discount over her limit**: "*Does:* Mr Kola Bankole, a repeat guest, calls for the same Deluxe King, Bed & breakfast, 9–12 Dec, and asks for 15%. Chiamaka sets 15% with reason Repeat guest; on Review the button reads Ask for approval · 15%. Tunde comes to the desk, taps his name and enters his PIN, then Approve 15% and book. *Sees:* '15% is over your 12% discount limit. A manager with a higher limit can approve it when you book.'; the prompt with ₦168,000.00 → ₦142,800.00 a night and ₦617,400.00 → ₦524,790.00* incl. taxes; VI-2611-0484 with 'Approved by Tunde Bello'. *Behind the scenes:* the server checks Tunde's PIN on the shared counter, that he works at Kora Victoria Island, isn't Chiamaka, and that 15% is within his 50%; the approval is bound to the priced stay and used once inside the booking transaction. Audit events `approval.granted` (method PIN on FD-VI-01) and `stay.discount_applied` with approver Tunde. About 15 seconds more than a normal booking." (6a stays as written, VI-2611-0483 without a discount; the spec's user flow uses Ms Collins as brick 4's discount variant did, the walkthrough a second caller with the same figures.)
- Step 8 (walk-in, brick 8): add "the same approval prompt as step 6b" to *Sees*; no other change.
- "What can go wrong": replace "Discount above her limit while booking: refused…until approvals (brick 5)" with "**Approver not at the desk:** she sends it to Tunde's inbox; Review shows 'Waiting for Tunde Bello · expires 11:06'; he approves from his phone with his PIN and she books. If he doesn't answer in 30 minutes it expires and she asks again or lowers it. The room isn't held while she waits." Replace the existing "Approver not at the desk… the stay stays at BAR until approved" line with the above. Change "Wrong approver PIN: … Lockout is per member and syncs." to "Wrong approver PIN: 'That PIN didn't match. 2 tries left.' The tries count with the lock screen's; five lock his PIN for 15 minutes."
- "Becomes tests": replace "a discount over the limit is refused on the server" with "a discount over the limit is refused without an approval and booked with one"; keep "A 15% discount is refused for front desk alone and succeeds with Tunde's PIN; the audit event carries reason, actor and approver; Tunde can't approve his own." and add "An approval is used once and only for the stay it was given for; a request to Tunde's inbox is approved from his phone and the booking completes."
- `night-audit.md` Open question "Remote approval": answer "Yes: the inbox is the same mechanism for any kind (brick 5); waivers use it from brick 6."
- `owner-morning.md`: no change now (brick 16 writes the report line with "Approved by").

## Changes needed in `docs/design/screen-inventory.md`, `docs/design/CHANGES.md` and `docs/ARCHITECTURE.md` (with the build)
- **Inventory:** "Shared-device PIN sign-in, approval prompt" → approval prompt built (Stage 1 brick 5, over-limit discounts on New reservation). "Approvals inbox" → built (Stage 1 brick 5: discounts; refunds, POs and payroll with their bricks). "Notifications centre" → bell built for approvals only. "New reservation" → approvals built.
- **CHANGES:**
  - **Approval prompt:** "Send to Tola's phone instead" becomes "Send to Tunde's inbox" (no phone push until a provider is chosen); no "on shift" tag (no manager shifts yet); nobody pre-selected unless only one approver; the primary button on New reservation is "Approve 15% and book"; the prompt opens from Review & book, not from Room & rate.
  - **Approvals inbox:** a third segment **Asked by you**; no filter pills while there is one kind; no "Related" section; error copy without WhatsApp; offline copy drops "requesters can still get a PIN approval on their own device" (it needs a connection); Approve with PIN opens a PIN dialog on desktop.
  - **Bell:** approvals only, no Mark all read, no Needs action pill.
- **ARCHITECTURE:** add `approvals/` to the API layout; mark request-flow step 4's approval part built (brick 5); add the lock order with approval rows; add the `approvals.expire` job; note that background polls don't count as PIN-session activity.

## Tests (tester, with the build)
**API** (`apps/api/src/approvals/*.test.ts`, `reservations/*.test.ts`, against the test database)
- Eligibility: only members at the hotel with limit ≥ value and a PIN; never the requester; Sade eligible for 15% at Kora Victoria Island, not 30%; Adaeze (no limit) always; order by limit then name.
- Approve here: right PIN → `approved`, `pin_here`, bound; wrong PIN shares the lock-screen counter (3 at the lock screen + 2 here = locked, `pin.locked`); third lockout → `PIN_NEEDS_RESET`; no device cookie → `PIN_HERE_NEEDS_DEVICE`; approver not at the device's hotel → refused.
- Inbox: request (idempotent) → pending; only the addressed approver answers; approve needs the PIN; decline needs a comment; cancel by the requester only; approve racing cancel → exactly one wins.
- Self-approval refused for every procedure, whatever ids are sent.
- Expiry: pending and approved rows past 30 minutes read as expired and are stored by the job with one `approval.expired` each and the draft cleared; an approval from a previous business date is refused at use.
- Use: booking with an approval writes `stay.discount_applied` with `approverMemberId`, `approvalId`, method; the approval is used; second use → `APPROVAL_USED`; other stay hash → `APPROVAL_NOT_MATCHING`; other requester → refused; other hotel → not found; approver's limit lowered or access removed between grant and use → `APPROVAL_NO_LONGER_VALID`; idempotent retry returns the same reservation.
- Race: two bookings with one approval, 200 runs, exactly one succeeds; no deadlocks with the new lock order (brick 4's no-deadlock test extended with approvals).
- Over the limit without approval → `DISCOUNT_OVER_LIMIT` with `canAsk: true` (brick 4 test updated).
- Organization isolation and property scoping for every procedure; PIN session sees only its hotel; All hotels lists every accessible hotel.
- `draft` returned only to the requester; subject and audit events carry no phone or email.
- Background polls don't move a PIN session's activity time.
- Every transition writes its audit event in the same transaction (a failed write leaves no event).

**Web** (Vitest): booking model maps quote and server answers to `over_limit / waiting / approved / declined / expired`; changing price-affecting fields cancels or drops the approval; copy builders for the prompt, rows and errors.

**E2E** (`apps/web/e2e/approvals.spec.ts`, desktop and phone): same-screen path on a registered device to a booked reservation showing the approver; wrong PIN message; inbox path with two browser contexts (requester sees the answer without reloading); decline with comment; Continue booking after a lock; requester not in the approver list. `accessibility.spec.ts` gains `/approvals` (all three segments), the open prompt and the bell popover, light and dark, desktop and phone.

## Reports
No new reports. From the fixed catalogue:
- **Rate override & discount** (brick 15): adds the approver and method per discount.
- **Owner's daily report** (brick 16): the discount exception line ends "· Approved by Tunde Bello".

## UI copy
- Room & rate (over limit): "15% is over your 12% discount limit. A manager with a higher limit can approve it when you book."
- Review: "Ask for approval · 15%" · "Waiting for Tunde Bello · asked 10:36 · expires 11:06" · "Cancel request" · "Waiting for approval" (disabled) · "Approved by Tunde Bello at 10:39" · "Book · ₦524,790.00" · "Tunde Bello declined 15%: “Max 12% this week”" → "Change discount" · "Tunde didn't answer by 11:06. Ask again or change the discount." → "Ask again"
- Prompt: "Needs a manager" · "Discount 15% on Deluxe King · Bed & breakfast" · "Chiamaka's limit is 12%. Asked at 10:36 on FD-VI-01." · "Plan price" · "Discount 15%" · "New rate" · "Stay total incl. taxes" · "Reason from Chiamaka" · "Approving manager" · "Tunde Bello · General manager" · "Tunde, enter your PIN" · "Approve 15% and book" · "Not nearby? Send to Tunde's inbox" · "Pick who to ask" · "Logged with both names, the reason and this device. Chiamaka stays signed in." · "Cancel"
- Prompt, personal device: "Approvers enter their PIN on a shared hotel device. From here, send the request to their inbox." → "Send to Tunde's inbox"
- Prompt, nobody: "Nobody at Kora Victoria Island can approve 15% right now. Use up to 12%." · "Approvers need a PIN. Tunde Bello hasn't set one yet."
- PIN: "That PIN didn't match. 2 tries left." · "Too many tries. Tunde's PIN is locked until 10:51. Pick another manager or send it to an inbox." · "Tunde's PIN needs a reset by a manager."
- Bell: aria-label "Approvals, 1 waiting for you" · "Notifications" · "Waiting for you" · "15% discount waiting for you" · "Chiamaka Eze · Sarah Collins · 2 min" · "Review" · "Your requests" · "Tunde approved 15% for Sarah Collins" · "Waiting for Tunde Bello" · "Continue booking" · "See all" · empty "Nothing waiting for you" / "You're all caught up."
- Approvals page: "Approvals" · "Everything waiting for Tunde Bello · Kora Victoria Island" (All hotels: "· All hotels") · "Waiting 1" · "Asked by you" · "Done" · "Over limit · Kora Victoria Island" · "Discount 15% · Sarah Collins" · "− ₦75,600.00" · badges "Waiting", "Approved", "Approved · used for VI-2611-0484", "Declined", "Expired", "Cancelled"
- Detail: "Asked by" "Chiamaka Eze · FD-VI-01" · "When" "25 Nov 10:36 · 2 min ago" · "Booking" "Deluxe King · Bed & breakfast · 9–12 Dec 2026 · 3 nights" · "Limit" "12% · front desk" · "Rate" "₦168,000.00 → ₦142,800.00 a night" · "Stay total incl. taxes" "₦617,400.00 → ₦524,790.00" · "Comment (required to decline)" · "Decline" · "Approve with PIN" · "Approve discount" (phone and PIN dialog) · "Chiamaka sees your answer on her screen within seconds. Both names are kept in the audit trail."
- Toasts: "Sent to Tunde Bello" · "Request cancelled" · "Request to Tunde cancelled" · "Tunde Bello approved 15%" · "Approved 15% for Sarah Collins" · "Declined 15% for Sarah Collins" · "Booked VI-2611-0484 for Sarah Collins"
- Errors: "You can't approve your own discount. Ask another manager." · "Tunde Bello can't approve 15% at Kora Victoria Island." · "Approving here needs a shared hotel device. Send it to an inbox instead." · "Add a comment so Chiamaka knows why." · "Chiamaka cancelled this request at 10:40." · "This request expired at 11:06." · "You already approved this request at 10:39." · "Chiamaka Eze no longer works at Kora Victoria Island." · "This approval was already used for VI-2611-0484. Ask again for a new booking." · "Tunde's approval expired at 11:09. Ask again." · "The booking changed after Tunde approved it. Ask again." · "Tunde Bello can no longer approve 15%. Ask another manager." · "Couldn't load approvals at Kora Victoria Island." → "Try again"
- Empty: "Nothing waiting for you. Approvals your team asks you for show up here." · "You haven't asked for any approvals today. When a discount is over your limit, you can ask a manager from Review & book." · "No answered requests yet."
- Offline: "Approval needs a connection." · "Offline since 17:32. Showing what loaded before 17:32. Approving needs a connection." · "You're offline. Approvals show again when you're back."
- Leave guard: "Discard this booking? Your request to Tunde is cancelled." → "Discard booking"
- Reservation detail: "Plan price ₦168,000.00 · 15% discount, Repeat guest (Chiamaka Eze) · Approved by Tunde Bello" · Activity "Discount 15% · ₦168,000.00 → ₦142,800.00 · “Repeat guest” · Approved by Tunde Bello (PIN on FD-VI-01)"

## Out of scope
- Any approval kind other than the over-limit discount on a new reservation: refunds, voids, comps, POS discounts, credit limit, penalty waivers (brick 6 adds "ask someone who has the permission" for actions without a limit), payroll and purchase orders. Each registers its kind with its brick.
- Discount changes on existing reservations (brick 6 modify) and walk-ins (brick 8): they reuse the prompt with their bricks.
- Approver counter-offers ("approve 12% instead"), multi-step or two-person approvals, approval rules naming a fixed approver, delegation and out-of-office.
- WhatsApp, SMS, email or push notifications; read/unread state; the other notification types in the design; "What each role is alerted about".
- Holding the room while waiting; booking automatically on approval (Open question 1).
- Approving offline; approving here on a personal device with a password (Open question 4).
- A setting for the expiry time (Open question 3).
- ⌘K entries ("Approvals", "Ask for approval"): with the command palette brick.

## Owner decisions (2026-11-27)
All four answered as recommended: the agent books after an inbox approval; a request goes to the one manager the agent picks; 30 minutes to answer and 30 to use, never past the business date, no setting; same-screen PIN approval only on registered hotel devices, inbox elsewhere.

1. **Inbox path: who presses Book?** Recommended: **the agent books after the approval arrives** (one click; Book lights up on her screen within seconds; if her PC locked meanwhile, **Continue booking** from the bell restores it). The approval doesn't book by itself, because the agent confirms the final price with the guest and the room may have sold meanwhile. Alternative: the approval books automatically as the agent's booking.
2. **Who receives an inbox request?** Recommended: **the one manager the agent picks** (as in the design), listed lowest limit first so the owner isn't asked by default. Alternative: every eligible manager at the hotel, first answer wins (faster answers, but noisier inboxes and owners asked for every desk discount).
3. **How long does a request last?** Recommended: **30 minutes to answer, then 30 minutes to use, and never past the business date**, fixed for every hotel with no setting.
4. **On a personal laptop (not a registered hotel device), can a manager approve on the same screen?** Recommended: **no, inbox only there.** A 4-digit PIN is safe only behind a registered device (decision 0022), and typing a manager's full password on someone else's laptop is worse. Front desk PCs are registered shared devices, so the desk always has the same-screen path.

Legal checks: none new. Contact details in a pending request's draft rest on the contract for the stay (NDPA 2023), are shown only to the requester, and are cleared when the request closes.
