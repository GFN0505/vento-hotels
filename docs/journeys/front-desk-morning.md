# Front desk morning

## Who, goal, device, stage
- **Who:** Chiamaka Eze, front desk agent (`front_desk`), Kora Victoria Island, morning shift 07:00–15:00. Tunde Bello (GM) approves one discount on the same PC with his PIN.
- **Goal:** get every arrival into a ready room, settle every departure, and hand over a drawer that balances.
- **Device:** front desk PC 1 (registered to Kora Victoria Island), A4 printer, a Moniepoint POS terminal on the counter, desk camera for ID scans.
- **Stage:** 1 (front office). The AC fault, work order and OOO come from stage 2; settling to the city ledger touches the stage 5 city ledger (see Open questions).
- **Screens:** 22 sign-in and manager PIN approval, 34 cash and deposits (open shift, blind count, matching queue), 30 arrivals/departures/in-house, 7 folio and check-out, 6 check-in and 60-second walk-in, 21 registration card, 31 front desk dialogs (room move, take payment), 13 work orders, 29 approvals inbox, 28 audit drawer.

**Setting:** Wednesday 25 Nov 2026. Calendar date and business date are both 25 Nov 2026 (Ibrahim closed 24 Nov at 01:05). This is the same day as `room-attendant-shift.md` and `waiter-dinner-service.md`. Amounts marked * include tax lines; like the dinner walkthrough they use service charge 10% and, for illustration only, VAT 7.5% and Lagos consumption tax 5%. Tests read rates from configuration.

## The walkthrough

1. **06:52 Sign in.**
   - *Does:* taps her avatar on the lock screen of front desk PC 1 and enters her 4-digit PIN.
   - *Sees:* the Front desk lists (#30) with the Tonight strip. Top bar: "Kora Victoria Island · Business date 25 Nov 2026". No property switcher: she is limited to Kora Victoria Island.
   - *Behind the scenes:* PIN checked against the device's cached salted hash, so sign-in works offline. Audit event `member.signed_in_with_pin` (Chiamaka, PC 1, Kora Victoria Island, business date 25 Nov).

2. **06:55 Open her cashier shift.**
   - *Does:* ⌘K → "Open shift", counts the float and enters ₦50,000.00.
   - *Sees:* "Shift open · Float ₦50,000.00 · Chiamaka · PC 1". Before this, Take payment and Check out said "Open a shift to take payments".
   - *Behind the scenes:* `cashier_shift` created with opening float, device and business date. Audit event `cashier_shift.opened`.

3. **07:05 Read the day.**
   - *Sees:* the tabs Arrivals, Departures and In house with their counts, and "Tonight · 25 Nov — occupied · arriving · vacant · 1 out of order · not in a room yet" (the tape chart's figures). Each arrival shows room readiness (emerald Inspected or Clean, amber Dirty, "Due out · Asante K.", "Not in a room") and the booking's notes. Mr Daniel Mensah · Acme Energy · 502 · amber "Dirty" · "Early arrival 11:30, quiet room".
   - *Behind the scenes:* stays with arrival = business date; readiness is the room's housekeeping status, and "Due out" when its in-house guest leaves today. (Balance due comes with brick 10.)

3a. **07:10 Assign today's arrivals.**
   - *Does:* opens the Tape chart, opens Deluxe King's Unassigned lane and drags Mrs Adebayo onto 408.
   - *Sees:* rows free for both nights light up; "Funmilayo Adebayo assigned to 408 · Undo".
   - *Behind the scenes:* the stay and room 408 are locked, 408 is checked free for 25 and 26 Nov, no inventory row changes; `stay.room_assigned`. About 5 seconds.

4. **07:35 Departure from 502 (Acme Energy guest).**
   - *Does:* clicks "Check out" on the Departures tab. Stay 22–25 Nov · 3 nights, Acme Corporate, room routed to Acme.
   - *Sees:* Folio A (guest extras: Calabash dinners, laundry) ₦46,500.00 + tax lines = ₦56,962.50*. Folio B (Acme): 3 × ₦180,000.00 + tax lines = ₦661,500.00*. A city ledger panel: "Acme Energy Ltd · Balance ₦9,187,500.00 · Limit ₦15,000,000.00 · After this ₦9,849,000.00".
   - *Behind the scenes:* postings grouped by business date, each with department and its VAT, consumption tax and service charge lines; balance derived from postings, never stored.

5. **Split settlement.**
   - *Does:* Folio A: "POS terminal", ₦56,962.50, terminal reference from the slip. Folio B: clicks "Settle ₦661,500.00 to Acme Energy Ltd".
   - *Sees:* both folios settled; the invoice PDF ready to email to Acme's accounts contact; the receipt ready for WhatsApp. 502 turns `vacant` + `dirty` (checked out 07:40).
   - *Behind the scenes:* the credit limit check runs inside the settlement transaction. A city ledger invoice is created for Acme with 30-day terms. Audit events `payment.taken`, `folio.settled_to_city_ledger`, `stay.checked_out`. Housekeeping sees 502 as a departure with an early arrival tag.

6. **10:15–10:25 AC fault in 503, room move.** (Stage 1; Stage 2 adds Blessing's fault report and the work order.)
   - *Does:* Tunde hears from maintenance that 503's AC compressor needs a part. On the Tape chart he clicks 503 → Put out of order, 25–27 Nov, reason AC.
   - *Sees:* "Room 503 has Emeka Kalu on 25–27 Nov. Move the booking first." Mr Kalu is in house 23–27 Nov in 503: Chiamaka moves him to 501 from the In house tab (Room move, reason Maintenance, 4 clicks). Nights 23–24 Nov stay in 503 on the tape chart; 503 turns dirty. Then Tunde puts 503 out of order: "503 out of order until 27 Nov", and Executive King's Available row drops by one on 25 and 26 Nov.
   - *Behind the scenes:* the move locks Mr Kalu's reservation and rooms 501 and 503, keeps 23–24 Nov as a room segment in 503 (decision 0030) and sets 503 dirty in the same transaction; the out-of-order locks 503 and Executive King's rows for 25 and 26 Nov, checks no night goes short, and removes one room; audit events `stay.room_moved` (503 → 501, in house), `room.status_changed` (`source: 'room_move'`) and `room.out_of_order` (`exception: 'out_of_order'`). Tomorrow's owner's report lists it.

6a. **10:32 Phone booking.**
   - *Does:* Ms Sarah Collins calls for 9–12 Dec. Chiamaka opens New reservation, picks the dates and 1 adult, sees Deluxe King "7 · 5 · 3" and Junior Suite "Sold out 11 Dec", picks Bed & breakfast, finds no match for Collins, adds her (British, phone), and books.
   - *Sees:* ₦504,000.00* for 3 nights, deposit due ₦168,000.00* by 27 Nov, ≈ £258.46 at ₦1,950/£; reservation VI-2611-0483; she copies the confirmation into WhatsApp with Zenith Bank 0123454471 and the reference.
   - *Behind the scenes:* one transaction locks Deluxe King for 9, 10 and 11 Dec, checks the overbooking limit (0), adds one booked room per night, stores the plan price and terms; audit events `guest.created`, `reservation.created`. About 75 seconds.

6b. **10:36 Discount over her limit.**
   - *Does:* Mr Kola Bankole, a repeat guest, calls for the same Deluxe King, Bed & breakfast, 9–12 Dec, and asks for 15%. Chiamaka sets 15% with reason Repeat guest; on Review the button reads Ask for approval · 15%. Tunde comes to the desk, taps his name and enters his PIN, then Approve 15% and book.
   - *Sees:* "15% is over your 12% discount limit. A manager with a higher limit can approve it when you book."; the prompt with ₦168,000.00 → ₦142,800.00 a night and ₦504,000.00 → ₦428,400.00* incl. taxes; VI-2611-0484 with "Approved by Tunde Bello".
   - *Behind the scenes:* the server checks Tunde's PIN on the shared counter, that he works at Kora Victoria Island, isn't Chiamaka, and that 15% is within his 50%; the approval is bound to the priced stay and used once inside the booking transaction. Audit events `approval.granted` (method PIN on FD-VI-01) and `stay.discount_applied` with approver Tunde. About 15 seconds more than a normal booking.

6c. **11:10 Guest adds a night.**
   - *Does:* Ms Collins calls to stay until 13 Dec. Chiamaka opens VI-2611-0483, Modify (or M), sets Leave to 13 Dec, saves.
   - *Sees:* "+1 night", "Sat 12 Dec · Bed & breakfast · new night at today's rate ₦168,000.00", ₦504,000.00 → ₦672,000.00*, "Deluxe King is free on 12 Dec. Same plan, no approval needed.", Save · +₦168,000.00. Activity: "Changed · 9–12 Dec → 9–13 Dec 2026 · ₦504,000.00 → ₦672,000.00".
   - *Behind the scenes:* one transaction locks the reservation and Deluxe King for 12 Dec, adds one booked room, keeps 9–11 Dec at their stored prices and prices 12 Dec at today's Bed & breakfast rate; audit event `reservation.modified`. About 25 seconds.

6e. **11:12 Mr Mensah extends.**
   - *Does:* drags the end of his bar on 502 to 30 Nov.
   - *Sees:* "+₦441,000.00", "Room 502 is free both nights", Extend stay.
   - *Behind the scenes:* brick 6's modify with room 502 locked; `reservation.modified`.

6d. **11:20 Late cancellation.**
   - *Does:* Mr Obi cancels VI-2611-0447 (Executive King, 26–28 Nov); free cancellation ended 24 Nov, 14:00. Chiamaka clicks Cancel, picks Guest request and cancels.
   - *Sees:* "Penalty: First night · ₦257,250.00*", "2 nights released (26 and 27 Nov)", Cancel booking · ₦257,250.00 penalty; then Cancelled with the Penalty card "To charge".
   - *Behind the scenes:* both nights released under the inventory lock; `reservation.cancelled` and `penalty.recorded`; the penalty is charged from the deposit once folios arrive (brick 10). If Tunde agrees to waive it, she ticks Waive the penalty with a reason, he enters his PIN on her screen (Approve waiver and cancel), and the owner sees "Penalty waived … Approved by Tunde Bello" tomorrow.

7. **10:40 Walk-in: the Okoro family.**
   - *Does:* **W** on the Front desk. Mr and Mrs Okoro with two children, 25–27 Nov · 2 nights. Picks Standard Queen (sofa bed) → room 302 (inspected) → Best available → Mr Okoro (Nigerian, NIN, home address typed, ID photo taken with the desk camera) → **Check in to 302**.
   - *Sees:* one screen (#6 walk-in). Standard Queen ₦120,000.00 × 2 nights with tax lines listed separately; the total updates as she types; Mr Okoro's NIN masked once saved.
   - *Behind the scenes:* reservation (source `walk_in`), stay, registration and check-in in one transaction; Standard Queen locked for 25 and 26 Nov; `reservation.created`, `guest.registration_captured`, `guest.id_document_captured`, `stay.checked_in`. The folio comes with brick 10.

8. **Discount above her limit.**
   - *Does:* Mr Okoro asks for a better price. She sets 15%, reason "Family, 2 nights midweek, low Standard Queen occupancy".
   - *Sees:* the same approval prompt as step 6b. In the same dialog: "15% is above your 10% limit. Ask a manager to approve." Tunde taps his avatar and enters his PIN. Rate becomes ₦102,000.00 per night, ₦204,000.00 before tax lines.
   - *Behind the scenes:* the server re-checks both limits (front desk ≤ 10%, GM ≤ 50%) and that Tunde isn't approving his own action. Audit event `stay.discount_applied`: before ₦120,000.00, after ₦102,000.00, reason, actor Chiamaka, approver Tunde. It is an exception in tomorrow's owner's daily report.

9. **Transfer payment and deposit.**
   - *Does:* Mr Okoro transfers the stay ₦249,900.00* plus a ₦50,000.00 deposit for extras, ₦299,900.00* in one transfer. She picks "Bank transfer", enters his bank and the session reference `100004251125104131234567`, then issues keys for 302.
   - *Sees:* stay balance ₦0.00, ₦50,000.00 in credit, and "Transfer ₦299,900.00 · awaiting bank match".
   - *Behind the scenes:* `bank_transfer` payment with reference, unmatched until it appears in the payment matching queue (#34). Walk-in time on the clock: 58 seconds from W to the toast (recorded as `durationSeconds` on `stay.checked_in`), plus the wait for Tunde. (Stage 1: payment comes with brick 10.)

10a. **11:10 502 is clean.**
   - *Does:* Blessing calls; Chiamaka clicks 502 → Mark clean.
   - *Sees:* "502 marked clean · Undo".
   - *Behind the scenes:* `room.status_changed` dirty → clean with her name; works offline. (Stage 2 replaces the call with the attendant app and Grace's inspection.)

10. **11:35 Check in Mr Mensah.**
    - *Does:* 502 turned emerald (clean) at 11:10. She clicks "Check in" on his row, checks his Ghanaian passport and photographs it with the desk camera.
    - *Sees:* the check-in sheet (#6): Verify ID (the photo's preview), Registration with the **foreign national section** (passport `G••••••12` once saved, Not required · ECOWAS citizen preset, occupation, arriving from Accra, next destination Accra), then Room 502 Clean · Chiamaka Eze · 11:10 and **Check in to 502**; the card prints.
    - *Behind the scenes:* passport number encrypted at rest (decision 0031); the passport photo in the private bucket behind 60-second links for GMs and owners. One guest profile for the group. Audit events `guest.id_document_captured`, `guest.registration_captured`, `stay.checked_in`, `registration_card.printed`.

11. **Folios and key.**
    - *Does:* confirms the routing that came with the corporate booking, takes ₦30,000.00 cash as a deposit for extras, has him sign the registration card (#21, printed at check-in) and hands key 502. (Stage 1: the card and signature are built; folios and the deposit come with brick 10, and no key is recorded until key cards after v1.)
    - *Sees:* Folio A, Mr Daniel Mensah: extras (breakfast, Calabash, Pool bar, room service, laundry, minibar), ₦30,000.00 in credit. Folio B, Acme Energy Ltd: room at Acme Corporate, ₦180,000.00 per night, room only, "inclusive of VAT, Lagos consumption tax and 10% service charge".
    - *Behind the scenes:* routing rule on the stay (`room` → Folio B). Cash deposit posted to Folio A on business date 25 Nov, on her shift. No room charge yet: night audit posts it. Audit events `folio.routing_set`, `payment.taken` (brick 10).

12. **14:45 Close her shift with a blind count.**
    - *Does:* ⌘K → "Close shift". Counts the drawer and types ₦80,000.00 without seeing what is expected.
    - *Sees:* after submitting: "Expected ₦80,000.00 · Counted ₦80,000.00 · Variance ₦0.00". Takings by method: cash ₦30,000.00; transfer ₦299,900.00*; POS terminal ₦56,962.50* plus room 304 (a short stay, see `owner-morning.md`); city ledger ₦661,500.00*. She prints the shift report.
    - *Behind the scenes:* shift closed and locked. Audit event `cashier_shift.closed` with counted, expected and variance. A non-zero variance would need a reason and would appear in the owner's daily report.

## What can go wrong
- **No shift open:** Take payment and Check out say "Open a shift to take payments", with the button beside it.
- **Early arrival, room not ready:** check-in lists ready rooms of the type first; a room not ready can be chosen with a warning ("403 is dirty. The guest can register now and get the key when it's clean."), and the stay shows **Waiting for room** until the room is marked clean.
- **Check-in made on the wrong booking:** Undo within 8 seconds; after that Tunde reverses it with a reason (never his own); the room is set dirty and it's in tomorrow's owner's report.
- **No camera at the desk:** a GM or the owner can skip the ID photo with a reason; the stay shows **ID photo to add** until one is added.
- **Walk-in for a sold-out type:** the type shows "0 left" and can't be picked. If two agents take the last Standard Queen at the same moment, the second sees "Standard Queen was just sold for 25 Nov. Pick another type." Nothing is saved for the second.
- **Booking for a sold-out night:** the type shows 0 and "Sold out 11 Dec"; if two agents book the last room at once, the second sees "Deluxe King was just sold for 11 Dec" with what is still free, and nothing is saved.
- **Approver not at the desk:** she sends it to Tunde's inbox; Review shows "Waiting for Tunde Bello · expires 11:06"; he approves from his phone with his PIN and she books. If he doesn't answer in 30 minutes it expires and she asks again or lowers it. The room isn't held while she waits.
- **Internet down:** walk-ins are disabled with "Walk-ins need a connection to check live availability"; check-in of an arrival already in a room works (the typed numbers and the ID photo are kept encrypted on the PC) and shows "Will sync" until it goes through. Cash and POS-terminal payments come with brick 10.
- **Transfer not yet in the bank:** the payment stays "awaiting bank match" and ages in the matching queue (whether the key can be issued first is an open question).
- **Guest wants a night that's sold out:** "Sold out 12 Dec" on the Room type and Save; nothing changes.
- **Waiver without a manager nearby:** she cancels now and sends the waiver to Tunde's inbox; the Penalty card shows "Waiver asked of Tunde Bello" until he answers, then "Waived · Approved by Tunde Bello".
- **Wrong approver PIN:** "That PIN didn't match. 2 tries left." The tries count with the lock screen's; five lock his PIN for 15 minutes.
- **Over the credit limit:** the settle button reads "Over Acme's limit by ₦…" and the same dialog asks for a GM or finance PIN.
- **OOO would overbook:** "Executive King would be 1 room short on 26 Nov." before anything changes; nothing is saved.
- **Room move to a dirty room:** dirty rooms are listed after ready ones with their status; moving to one is allowed.
- **Guest asks for a better room type while the booked type has rooms:** Room move lists only the booked type; dropping on another type says "A Deluxe King room is free: assign one of those". An upgrade is offered only when the booked type is full; otherwise it's a Modify (a booking change, re-priced).
- **Blind count mismatch:** variance shown only after submission; a reason is required to close; the count can't be edited afterwards.

## Targets
- PIN sign-in to arrivals list: under 5 seconds.
- Check-in of a pre-assigned returning guest: 2 clicks. Check-in of a first-time foreign national with the passport photo: under 2 minutes trained, under 5 minutes for a new agent with no training.
- Walk-in: under 60 s from W to the toast, excluding payment (brick 10) and the approver's wait.
- Assign a room: 1 drag. Room move: 3 clicks. Extend by drag: 2 actions. Mark clean: 2 clicks.
- Check-out with split settlement: under 90 seconds.
- Every interaction under 100 ms; each screen loads in under 1 s.

## Becomes tests
`apps/web/e2e/journeys/front-desk-morning.spec.ts`
- PIN sign-in lands on #30 with "Business date 25 Nov 2026"; audit has `member.signed_in_with_pin` with the device id.
- Take payment is disabled until a shift is open; the opening float is stored.
- Check-out of 502 splits across POS terminal (reference required) and city ledger; settlement checks Acme's credit limit and creates an invoice; over-limit needs approval.
- Room move records reason and before/after; 503 can't go OOO while occupied; once OOO it is removed from Executive King availability for 25–26 Nov (the work order link comes with Stage 2).
- A room holds one booking per night (race test); out of order is refused while a booking is assigned and when a night would go short, and reduces rooms left on New reservation; assigning offers only the booked room type, and another type only as an upgrade when the booked type is full; an upgrade at the booked price over 12% needs Tunde's PIN; a booking from the chart can't start on a night the room isn't free; Mark clean works offline and syncs (`apps/api/src/rooms/*/*.test.ts`, `apps/api/src/reservations/assign/*.test.ts`, `apps/web/e2e/tape-chart.spec.ts`).
- A phone booking locks and decrements Deluxe King for each night and stores plan price and terms; the last-room race books once; a discount over the limit is refused without an approval and booked with one (`apps/api/src/reservations/*.test.ts`, `apps/api/src/approvals/*.test.ts`, `apps/web/e2e/reservations.spec.ts`).
- Walk-in decrements Standard Queen availability for both nights in one transaction; a concurrent walk-in for the last Standard Queen fails cleanly.
- A 15% discount is refused for front desk alone and succeeds with Tunde's PIN; the audit event carries reason, actor and approver; Tunde can't approve his own.
- An approval is used once and only for the stay it was given for; a request to Tunde's inbox is approved from his phone and the booking completes (`apps/api/src/approvals/*.test.ts`, `apps/web/e2e/approvals.spec.ts`).
- Extending locks the new night, keeps the booked nights' prices and prices the new one at today's rate; a late cancellation records the first-night penalty; a waiver is refused for front desk alone and succeeds with Tunde's PIN, with both names in the audit event (`apps/api/src/reservations/change/*.test.ts`, `apps/web/e2e/modify-cancel.spec.ts`).
- Transfer payment requires a reference and appears in the matching queue.
- Check-in of a Ghanaian guest shows the foreign national fields; the passport number is masked in the UI and never returned in plain text.
- Routing sends the room charge to the Acme folio and extras to the guest folio; no room charge exists before night audit.
- Blind count hides the expected amount until submission; a non-zero variance requires a reason.
- Offline: check-in of an assigned arrival queues and syncs; walk-in is disabled with its reason.
- Check-in needs the rule set's fields and the ID photo, and refuses a stay not arriving today; a foreign national's passport is never returned in plain text; a dirty room is allowed with the warning; in-house moves keep past nights in the old room and set it dirty; walk-in books and checks in in one transaction and two check-ins into one room fail cleanly; reversal is GM-only, never your own, and an exception (`apps/api/src/reservations/check-in/*.test.ts`, `apps/api/src/guests/registration/*.test.ts`, `apps/web/e2e/front-desk.spec.ts`).

## Open questions
- *Settled (brick 8):* **the Okoro family in a Standard Queen (step 7):** Standard Queen has a sofa bed (2 adults, 2 children), so they fit 302.
- **Is the front desk PC a shared device** (PIN sign-in) or a personal device (password + 2FA)? (Settled: front desk PCs are one of the three shared-device kinds, with PIN sign-in. Decision 0022.)
- *Settled (rate plans spec):* Acme's **Executive King rate** (₦180,000.00, plan `ACME`) is room only; breakfast goes on the guest folio.
- *Settled (rate plans spec):* a rate that includes breakfast (Acme's Deluxe King ₦130,000.00, plan `ACME-BB`) carries a **meal allocation** (₦18,000 per room per night) that night audit posts to food; the rest is rooms revenue.
- The 502 departure needs a **second Acme guest**; the demo world names none. *Answered for Stage 1:* 503's guest is Mr Emeka Kalu, arriving 25 Nov, moved to 501 (brick 7 seed); brick 8 makes him in house 23–27 Nov (done).
- Can a key be issued before a bank transfer is matched? Up to what amount, and by whom?
- Does Acme's credit check count charges already routed to Acme on open folios (Mr Mensah's stay), or only invoiced city ledger balances?
- The city ledger is stage 5, but stage 1 check-out needs "settle to city ledger". Bring a basic city ledger account into stage 1?
- *Settled (brick 8):* the 60-second walk-in is measured from W to the toast, including the registration and the card's print request, excluding payment and the approver's wait.
- *Settled (brick 8):* the ECOWAS visa exemption is a fixed option ("Not required · ECOWAS citizen"), offered to ECOWAS nationals only, from a list kept as data.
