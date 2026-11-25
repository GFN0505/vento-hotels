# Dinner service with a power cut

## Who, goal, device, stage
- **Who:** Emeka Nwosu (waiter, `waiter`), Halima Yusuf (restaurant cashier, `cashier`), Femi Adeyemi (F&B manager, `fnb_manager`). Guests: Mr Daniel Mensah (in house, Acme Energy Ltd) and a table of three walk-in diners. Ibrahim Musa (night auditor) appears at the end.
- **Goal:** run dinner at Calabash without losing an order or a naira, through a power and internet cut, and close the outlet cleanly before night audit.
- **Device:** a shared POS tablet registered to Kora Victoria Island, outlet Calabash restaurant (Emeka); the cashier station tablet (Halima); a kitchen display screen and the 80mm kitchen printers KITCHEN-1 and GRILL-1 on the pass; drinks print at the bar printer BAR-2. Femi approves on whichever tablet is nearest.
- **Stage:** 3 (Restaurant & bar).
- **Screens:** 22 (shared device sign-in, manager PIN approval), 11 (POS on tablet, kitchen display), 21 (80mm kitchen ticket and receipt), 7 (folio, as seen by front desk), 34 (cash and deposits: blind count, payment matching), 15 (cashier shift close, night audit checks), 36 (sync queue and conflicts), 20 (leakage exceptions), 28 (audit log).

**Setting:** Wednesday 25 Nov 2026, business date 25 Nov 2026. Mr Mensah checked into room 502 at 11:35 (see `room-attendant-shift.md`). His stay has routing: room (Acme rate ₦180,000 per night) to the Acme Energy Ltd folio (city ledger), extras to his own guest folio.

**Prices** below are illustrative seed prices, exclusive of tax. Tax lines use configuration; this walkthrough shows service charge 10% and, for illustration only, VAT 7.5% and Lagos consumption tax 5% on the food and drink subtotal. Tests must read rates from configuration, not these numbers.

| Item | Price |
|---|---|
| Grilled tilapia | ₦24,000 |
| Side: fried plantain (modifier) | +₦3,000 |
| Jollof rice with chicken | ₦14,000 |
| Suya platter | ₦13,000 |
| Goat meat pepper soup | ₦11,000 |
| Asun | ₦10,000 |
| Chapman | ₦6,000 |
| Star lager | ₦4,000 |

## The walkthrough

1. **PIN sign-in and table map (18:20).**
   - *Does:* Emeka taps his avatar on the Calabash tablet and enters his PIN.
   - *Sees:* the Calabash table map: 16 tables across main hall, terrace and private room, free in neutral, occupied in blue with covers and minutes since seated.
   - *Behind the scenes:* offline PIN check against the cached hash; `member.signed_in` audit event with device. Halima opened her cashier shift at 18:00 with a ₦20,000 float.

2. **Table 4 orders (19:05).**
   - *Does:* taps table 4, sets covers to 3, adds Jollof rice with chicken ×2, Suya platter, Goat meat pepper soup, Star lager ×3, then Asun.
   - *Sees:* the check building on the right, seat numbers on each line, running subtotal ₦74,000.
   - *Behind the scenes:* the check is created with a client UUID v7 (`open`), so it exists on the tablet before the server confirms it.

3. **Send to kitchen (19:07).**
   - *Does:* taps **Send**.
   - *Sees:* lines turn "Sent 19:07". The kitchen display shows the ticket "Table 4 · Emeka · 3 covers" with a timer; KITCHEN-1 prints the 80mm ticket and GRILL-1 prints the Suya platter. Star lager goes to the bar station and prints at BAR-2.
   - *Behind the scenes:* check `open → sent`; one ticket per station. Print is queued as a `print.ticket` audit command.

4. **Void after send needs Femi (19:10).**
   - *Does:* one diner changes his mind about the Asun. Emeka taps it, **Void**. The dialog asks for a reason and, because the ticket was sent, a manager PIN. Femi walks over, picks "Guest changed order", adds "Kitchen had not started", enters his PIN.
   - *Sees:* Asun struck through with "Voided · Femi · Guest changed order". The kitchen display shows "VOID Asun · Table 4" and a void slip prints.
   - *Behind the scenes:* Emeka's role cannot void after send; the approval carries Femi's member id. Audit event with both names, device, reason. It becomes a "POS void after send" exception for the owner's daily report. Subtotal back to ₦64,000.

5. **Mr Mensah, table 12, with modifiers (19:40).**
   - *Does:* Emeka adds Grilled tilapia with modifiers "Side: fried plantain (+₦3,000)", "Extra pepper", "No onions", and a Chapman. Sends.
   - *Sees:* modifiers indented under the dish; the kitchen ticket shows them in large text. Subtotal ₦33,000.

6. **Split and pay table 4 (20:15).**
   - *Does:* Emeka taps **Split → By seat**: seats 1–2 (2× Jollof, 2× Star) and seat 3 (Suya, Pepper soup, 1× Star). He prints both bills and brings them to Halima.
   - *Sees:* two bills, each with its own tax lines:

     | | Bill A (seats 1–2) | Bill B (seat 3) |
     |---|---|---|
     | Subtotal | ₦36,000.00 | ₦28,000.00 |
     | Service charge 10% | ₦3,600.00 | ₦2,800.00 |
     | VAT (illustrative 7.5%) | ₦2,700.00 | ₦2,100.00 |
     | Consumption tax (illustrative 5%) | ₦1,800.00 | ₦1,400.00 |
     | **Total** | **₦44,100.00** | **₦34,300.00** |

   - *Does (Halima):* Bill A: the diner shows a completed bank transfer to the hotel's account; Halima records **Bank transfer**, ₦44,100.00, reference "GTB-25112026-0193". Bill B: the diner wants to pay by card on the Moniepoint terminal, but at that moment the power goes (step 7).
   - *Behind the scenes:* Bill A `billed → paid`; the transfer is a payment with a reference that lands in the payment matching queue (screen 34) until matched to the bank statement.

7. **Power and internet cut (20:30).**
   - *Does:* the grid drops; the generator brings the lights back after about a minute; the internet stays down. Emeka keeps taking orders on battery.
   - *Sees:* on every tablet, the offline banner "Offline — changes will sync when you're back online" and a sync count.
   - *Behind the scenes, and what the offline-sync skill allows:*
     - Open checks, add/remove items, split/merge: allowed, queued in the IndexedDB outbox.
     - **Send tickets:** allowed "to a local printer if reachable". If the kitchen printer is on the local network and the router is on the generator or a UPS, the ticket prints from local data. The kitchen display, which gets tickets through the server, does **not** update while the internet is down. If the printer is not reachable, Emeka sees "Kitchen printer not reachable. Ticket saved — take it to the kitchen" and the ticket on screen to read or hand-write.
     - **Cash and POS-terminal payments** with the terminal reference: allowed.
     - **Bank transfer payments:** not on the offline allow-list, so **Transfer** is disabled with "Needs a connection to record". (See Open questions.)
     - Voids and comps: allowed if the member has the permission, reason still required; Femi's PIN is checked against the cache.

8. **Bill B on the POS terminal while offline (20:38).**
   - *Does:* the Moniepoint terminal works on its own SIM. The diner pays ₦34,300.00; Halima enters **POS terminal**, the amount and the terminal reference "MP-RRN-448210377".
   - *Sees:* "Paid · Saved on this device". The 80mm receipt prints from local data.
   - *Behind the scenes:* queued payment command with idempotency key; the receipt print is queued as an audit command.

9. **Mr Mensah charges dinner to his room, offline (20:45).**
   - *Does:* Mr Mensah's Chapman came late because of the cut. Femi comps it: **Comp**, reason "Service delay during power cut", his own PIN. Then Emeka taps **Post to room**, enters 502.
   - *Sees:* "Room 502 · Mr Daniel Mensah · in house (as of 20:29)". Emeka asks the guest to confirm his name; the guest signs the printed bill. Total posted: subtotal ₦27,000.00 + service charge ₦2,700.00 + VAT ₦2,025.00 + consumption tax ₦1,350.00 = **₦33,075.00**. Status "Posted to room · Saved on this device".
   - *Behind the scenes:*
     - The comp is costed but not revenue, a `comp` exception with Femi's name.
     - Post to room is allowed offline **only** because room 502 is in the cached in-house list; it would be blocked if he were not, or if the amount took him over his cached credit limit.
     - Routing decides the folio: the room charge goes to Acme Energy Ltd, so this F&B charge lands on **Mr Mensah's guest folio**, not Acme's.
     - Check `billed → posted_to_room` locally; the folio posting is created when the server applies the command.

10. **A second check for table 9 (20:50).**
    - *Does:* the bar tablet, also offline, opens a check for table 9 when two guests move from the Pool bar; Emeka also opens table 9 on his tablet for the same guests.
    - *Behind the scenes:* both checks are kept (skill rule: two offline checks for one table are never auto-merged).

11. **Back online and sync (21:20).**
    - *Sees:* the sync count drops from 14 to 0 within seconds, and one item in **Needs attention**: "Table 9 has two open checks from two devices. Merge or keep both." Femi merges them (screen 11, merge bills); the merge is an audit event.
    - *Behind the scenes:* commands apply in creation order per device, each in its own transaction, idempotent on replay. The room charge posts to Mr Mensah's folio on business date 25 Nov 2026 (not yet closed) with tax lines. The server re-checks that he is in house and that Femi still holds the comp permission. The kitchen display catches up and shows tickets sent offline as "Printed offline". The front desk sees ₦33,075.00 on his folio (screen 7).

12. **Close: blind count and outlet takings (22:45).**
    - *Does:* Halima taps **Close shift**, counts the drawer without seeing the expected figure and enters ₦117,000.00.
    - *Sees:* only after submitting: expected ₦118,000.00 (float ₦20,000.00 + cash sales ₦98,000.00), variance −₦1,000.00. She enters a reason: "Change given twice on table 2". Then outlet takings by method:

      | Method | Amount |
      |---|---|
      | Cash | ₦98,000.00 |
      | Bank transfer (to match) | ₦44,100.00 + others |
      | POS terminal | ₦34,300.00 + others |
      | Posted to room | ₦33,075.00 + others |
      | Comps (cost, not revenue) | ₦6,000.00 |
      | Voids after send | 1 (₦10,000.00, Femi) |

    - *Behind the scenes:* shift close is blocked offline, so it can only happen now. The variance is a cash exception with Halima's name. Unmatched transfers and terminal payments stay in the matching queue with ageing.

13. **Open bills before night audit (23:10).**
    - *Sees:* Ibrahim's night audit checks (screen 15) list "Calabash · table 15 · open since 21:55 · Emeka". Night audit cannot post until it is closed.
    - *Does:* Femi, still on site, settles it with Halima (cash). A bill left open past closing is listed as an exception.

## What can go wrong
- **Guest not in house:** post to room shows "Room 305 has no guest in house" and offers other payment methods. Offline, if the cached list cannot confirm, it is blocked: "Can't confirm the guest offline. Take another payment or wait for the connection."
- **"No post" flag or over credit limit:** blocked with the reason; the waiter is told to send the guest to the front desk.
- **Name doesn't match:** Emeka cannot override; he calls the front desk or takes another payment.
- **Over-limit discount:** a waiter has no discount permission; Halima can give up to 5%, Femi up to 20%, Tunde up to 50%. The same dialog asks for the approver's PIN. Nobody approves their own.
- **Approver lost permission before sync:** the comp or void is rejected at sync and listed under Needs attention for Femi.
- **Kitchen printer and display both unreachable:** the ticket stays on the tablet; the kitchen works from a hand-written or read-out order. The ticket is still marked sent with the time.
- **Business date closed while offline:** postings go to the current business date with the original time kept, flagged for the auditor.
- **Reprinted bill:** shows "REPRINT · copy 2" and is logged as a leakage signal.
- **Tablet reloaded offline:** the app shell loads from the service worker and the outbox survives.

## Targets
- PIN sign-in to table map under 3 seconds. Add an item: 1 tap; with a modifier: 2–3 taps.
- Send to kitchen to ticket on the display under 2 seconds online; printing offline under 5 seconds.
- Post to room in 3 taps plus the guest check, under 20 seconds.
- Manager PIN approval without leaving the check, under 15 seconds.
- Outbox of 50 commands syncs within 30 seconds after reconnection.
- Shift close (count, reason, report) under 3 minutes.

## Becomes tests
`apps/web/e2e/journeys/waiter-dinner-service.spec.ts`, on the demo seed:
- PIN sign-in on the Calabash tablet; table map renders; check created with a client id.
- Send creates kitchen, grill and bar tickets per station (KITCHEN-1, GRILL-1, BAR-2); kitchen display shows table 4 with a timer.
- Void after send is refused for a waiter; with Femi's PIN and a reason it succeeds; audit event has both members; exception "POS void after send" exists.
- Split by seat gives two bills with separate tax lines whose totals sum to the unsplit total.
- Transfer and POS terminal payments require a reference; both appear in the matching queue.
- Offline: banner and queue count; Transfer disabled with a reason; POS terminal payment and receipt print work; post to room for 502 succeeds from the cached in-house list and is blocked for a room not in it.
- Back online: queue drains; Mr Mensah's guest folio (not the Acme folio) has the ₦33,075.00 charge with tax lines on business date 25 Nov 2026; comp recorded as cost, not revenue.
- Two offline checks for table 9 both exist and appear under Needs attention.
- Shift close is disabled offline; blind count hides expected until submit; variance needs a reason.
- Night audit check lists the open check for table 15 and blocks posting until it is closed.

## Open questions
- **Bank transfers offline:** transfers are first-class in Nigeria but not on the offline allow-list. Can a cashier record a transfer reference offline, marked unverified, to be matched later?
- **Kitchen display offline:** the skill only promises a local printer if reachable. Do we want a LAN-only path to the kitchen display (print bridge or local relay), or is the printer the offline fallback?
- **Guest check for post to room:** what is the "PIN" in "name or PIN" — a PIN given at check-in, the room number plus surname, or a signature? How is it checked offline without caching guest secrets?
- **Who can post to room:** the permissions matrix has no row for it. Waiter, cashier, or both?
- **Tax on comps and voids:** does a comp carry tax lines at zero, and is service charge removed with it?
- **Inclusive or exclusive menu prices** for Calabash, and whether VAT and consumption tax apply to the subtotal or the subtotal plus service charge.
- **Cached credit limit for a guest:** where does the guest's own credit limit come from (deposit, card authorisation, a property default)?
- **Printer support:** which kitchen printers we certify and whether the print bridge ships in v1 (open in `DOMAIN.md`).
