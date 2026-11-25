# Front desk morning

## Who, goal, device, stage
- **Who:** Chiamaka Eze, front desk agent (`front_desk`), Lekki Bay Hotel, morning shift 07:00–15:00. Tunde Bello (GM) approves one discount on the same PC with his PIN.
- **Goal:** get every arrival into a ready room, settle every departure, and hand over a drawer that balances.
- **Device:** front desk PC 1 (registered to Lekki Bay), A4 printer, a Moniepoint POS terminal on the counter, desk camera for ID scans.
- **Stage:** 1 (front office). The AC fault, work order and OOO come from stage 2; settling to the city ledger touches the stage 5 city ledger (see Open questions).
- **Screens:** 22 sign-in and manager PIN approval, 34 cash and deposits (open shift, blind count, matching queue), 30 arrivals/departures/in-house, 7 folio and check-out, 6 check-in and 60-second walk-in, 21 registration card, 31 front desk dialogs (room move, take payment), 13 work orders, 29 approvals inbox, 28 audit drawer.

**Setting:** Wednesday 25 Nov 2026. Calendar date and business date are both 25 Nov 2026 (Ibrahim closed 24 Nov at 01:05). This is the same day as `room-attendant-shift.md` and `waiter-dinner-service.md`. Amounts marked * include tax lines; like the dinner walkthrough they use service charge 10% and, for illustration only, VAT 7.5% and Lagos consumption tax 5%. Tests read rates from configuration.

## The walkthrough

1. **06:52 Sign in.**
   - *Does:* taps her avatar on the lock screen of front desk PC 1 and enters her 4-digit PIN.
   - *Sees:* Arrivals, departures and in-house (#30). Top bar: "Lekki Bay Hotel · Business date 25 Nov 2026". No property switcher: she is limited to Lekki Bay.
   - *Behind the scenes:* PIN checked against the device's cached salted hash, so sign-in works offline. Audit event `member.signed_in` (Chiamaka, PC 1, Lekki Bay, business date 25 Nov).

2. **06:55 Open her cashier shift.**
   - *Does:* ⌘K → "Open shift", counts the float and enters ₦50,000.00.
   - *Sees:* "Shift open · Float ₦50,000.00 · Chiamaka · PC 1". Before this, Take payment and Check out said "Open a shift to take payments".
   - *Behind the scenes:* `cashier_shift` created with opening float, device and business date. Audit event `cashier_shift.opened`.

3. **07:05 Read the day.**
   - *Sees:* 14 arrivals, 11 departures, 38 in-house. Each arrival shows room readiness (emerald inspected, amber dirty, "Not assigned"), balance due and requests. Top row: Mr Daniel Mensah · Acme Energy Ltd · Deluxe · 25–28 Nov 2026 · 3 nights · Room 208 · amber "Due out first, dirty" · "Early arrival 11:30, quiet room".
   - *Behind the scenes:* stays with arrival date = business date. Readiness is the live housekeeping status; 208 is still occupied by a departing Acme guest.

4. **07:35 Departure from 208 (Acme Energy guest).**
   - *Does:* clicks "Check out" on the Departures tab. Stay 22–25 Nov · 3 nights, Acme Corporate, room and breakfast routed to Acme.
   - *Sees:* Folio A (guest extras: Coral dinners, laundry) ₦46,500.00 + tax lines = ₦56,962.50*. Folio B (Acme): 3 × ₦105,000.00 + tax lines = ₦385,875.00*. A city ledger panel: "Acme Energy Ltd · Balance ₦3,180,000.00 · Limit ₦5,000,000.00 · After this ₦3,565,875.00".
   - *Behind the scenes:* postings grouped by business date, each with department and its VAT, consumption tax and service charge lines; balance derived from postings, never stored.

5. **Split settlement.**
   - *Does:* Folio A: "POS terminal", ₦56,962.50, terminal reference from the slip. Folio B: clicks "Settle ₦385,875.00 to Acme Energy Ltd".
   - *Sees:* both folios settled; the invoice PDF ready to email to Acme's accounts contact; the receipt ready for WhatsApp. 208 turns `vacant` + `dirty` (checked out 07:40).
   - *Behind the scenes:* the credit limit check runs inside the settlement transaction. A city ledger invoice is created for Acme with 30-day terms. Audit events `payment.taken`, `folio.settled_to_city_ledger`, `stay.checked_out`. Housekeeping sees 208 as a departure with an early arrival tag.

6. **09:50–10:30 AC fault in 209, room move.**
   - *Does:* Blessing Udo reports "AC not cooling" in 209 from her phone; a wrench icon appears on 209. At 10:20 maintenance updates work order WO-0412: "Compressor fault, part needed, 2 days". Chiamaka calls the guest in 209 (Deluxe, BAR, in house 23–27 Nov) and offers a move. Opens the stay → "Room move" (#31). Ready Deluxe rooms are listed first; she picks 217 (inspected), rate unchanged, reason "AC fault, WO-0412".
   - *Sees:* "Moved to 217." Then maintenance puts 209 out of order 25–27 Nov from the work order; 209 shows rose on the board.
   - *Behind the scenes:* move recorded on the stay; folios and routing follow the stay. Putting 209 OOO locks the Deluxe inventory rows for 25 and 26 Nov and removes one room; Vento refused OOO while the guest was still in 209. Audit events `stay.room_moved` (before 209, after 217, reason), `room.status_changed` (`out_of_order`, work order linked).

7. **10:40 Walk-in: the Okoro family.**
   - *Does:* ⌘K → "Walk-in". Mr and Mrs Okoro with two children, 25–27 Nov · 2 nights. Picks Deluxe → BAR → room 210 (inspected) → Mr Okoro (Nigerian, NIN masked, phone `+234…`) → payment.
   - *Sees:* one screen (#6 walk-in). Deluxe BAR ₦120,000.00 × 2 nights with tax lines listed separately; the total updates as she types. "Deluxe · 2 left on 25 Nov".
   - *Behind the scenes:* reservation (source `walk_in`), stay and folio are created in one transaction. Deluxe inventory for 25 and 26 Nov is locked, checked and decremented in the same transaction.

8. **Discount above her limit.**
   - *Does:* Mr Okoro asks for a better price. She sets 15%, reason "Family, 2 nights midweek, low Deluxe occupancy".
   - *Sees:* in the same dialog: "15% is above your 10% limit. Ask a manager to approve." Tunde taps his avatar and enters his PIN. Rate becomes ₦102,000.00 per night, ₦204,000.00 before tax lines.
   - *Behind the scenes:* the server re-checks both limits (front desk ≤ 10%, GM ≤ 50%) and that Tunde isn't approving his own action. Audit event `stay.discount_applied`: before ₦120,000.00, after ₦102,000.00, reason, actor Chiamaka, approver Tunde. It is an exception in tomorrow's owner's daily report.

9. **Transfer payment and deposit.**
   - *Does:* Mr Okoro transfers the stay ₦249,900.00* plus a ₦50,000.00 deposit for extras, ₦299,900.00* in one transfer. She picks "Bank transfer", enters his bank and the session reference `100004251125104131234567`, then issues keys for 210.
   - *Sees:* stay balance ₦0.00, ₦50,000.00 in credit, and "Transfer ₦299,900.00 · awaiting bank match".
   - *Behind the scenes:* `bank_transfer` payment with reference, unmatched until it appears in the payment matching queue (#34). Walk-in time on the clock: 58 seconds, plus the wait for Tunde.

10. **11:35 Check in Mr Mensah.**
    - *Does:* 208 turned emerald (inspected) at 11:10. She clicks "Check in" on his row and scans his Ghanaian passport.
    - *Sees:* the check-in flow (#6). Nationality Ghanaian, so the **foreign national section** opens: passport number (masked, `G••••••12`), nationality, visa or permit ("Not required · ECOWAS citizen" offered), arriving from Accra, next destination Accra, purpose business. Room 208 first in the list.
    - *Behind the scenes:* passport number encrypted at rest; the scan stored in the private bucket behind short-lived links. One guest profile for the group. Audit events `guest.registration_captured`, `stay.checked_in`.

11. **Folios and key.**
    - *Does:* confirms the routing that came with the corporate booking, takes ₦30,000.00 cash as a deposit for extras, prints the registration card (#21) for his signature and issues key 208.
    - *Sees:* Folio A, Mr Daniel Mensah: extras (Coral, The Deck, laundry, minibar), ₦30,000.00 in credit. Folio B, Acme Energy Ltd: room and breakfast at Acme Corporate, ₦105,000.00 per night including breakfast, "exclusive of VAT, Lagos consumption tax and 10% service charge".
    - *Behind the scenes:* routing rule on the stay (`room`, `breakfast` → Folio B). Cash deposit posted to Folio A on business date 25 Nov, on her shift. No room charge yet: night audit posts it. Audit events `folio.routing_set`, `payment.taken`, `key.issued`.

12. **14:45 Close her shift with a blind count.**
    - *Does:* ⌘K → "Close shift". Counts the drawer and types ₦80,000.00 without seeing what is expected.
    - *Sees:* after submitting: "Expected ₦80,000.00 · Counted ₦80,000.00 · Variance ₦0.00". Takings by method: cash ₦30,000.00; transfer ₦299,900.00*; POS terminal ₦56,962.50* plus room 118 (a short stay, see `owner-morning.md`); city ledger ₦385,875.00*. She prints the shift report.
    - *Behind the scenes:* shift closed and locked. Audit event `cashier_shift.closed` with counted, expected and variance. A non-zero variance would need a reason and would appear in the owner's daily report.

## What can go wrong
- **No shift open:** Take payment and Check out say "Open a shift to take payments", with the button beside it.
- **Early arrival, room not ready:** check-in offers ready rooms of the same type first, or "Check in, room pending" so the guest can leave bags; the row stays amber until a room is assigned.
- **Walk-in for a sold-out type:** the type shows "0 left" and can't be picked. If two agents take the last Deluxe at the same moment, the second sees "Deluxe was just sold for 25 Nov. Pick another type." Nothing is saved for the second.
- **Internet down:** walk-ins and new bookings are disabled with "Needs a connection to check live availability". Check-in of an already assigned arrival and cash or POS-terminal payments still work and show "Saved on this device" until synced.
- **Transfer not yet in the bank:** the payment stays "awaiting bank match" and ages in the matching queue (whether the key can be issued first is an open question).
- **Approver not at the desk:** the discount goes to the approvals inbox (#29); the stay stays at BAR until approved, or she lowers it to 10%.
- **Wrong approver PIN:** "That PIN didn't match. 2 tries left." Lockout is per member and syncs.
- **Over the credit limit:** the settle button reads "Over Acme's limit by ₦…" and the same dialog asks for a GM or finance PIN.
- **OOO would overbook:** putting 209 OOO when every Deluxe is sold shows "Deluxe would be 1 room short on 26 Nov" with the booking affected, before anything changes.
- **Room move to a dirty room:** allowed with "217 is dirty. Move anyway?"; ready rooms are always listed first.
- **Blind count mismatch:** variance shown only after submission; a reason is required to close; the count can't be edited afterwards.

## Targets
- PIN sign-in to arrivals list: under 5 seconds.
- Check-in of a pre-assigned arrival with passport scan: under 2 minutes trained, under 5 minutes for a new agent with no training.
- Walk-in: under 60 seconds, excluding the approver's wait.
- Room move: 3 clicks from the stay.
- Check-out with split settlement: under 90 seconds.
- Every interaction under 100 ms; each screen loads in under 1 s.

## Becomes tests
`apps/web/e2e/journeys/front-desk-morning.spec.ts`
- PIN sign-in lands on #30 with "Business date 25 Nov 2026"; audit has `member.signed_in` with the device id.
- Take payment is disabled until a shift is open; the opening float is stored.
- Check-out of 208 splits across POS terminal (reference required) and city ledger; settlement checks Acme's credit limit and creates an invoice; over-limit needs approval.
- Room move records reason and before/after; 209 can't go OOO while occupied; once OOO it is removed from Deluxe availability for 25–26 Nov with the work order linked.
- Walk-in decrements Deluxe availability for both nights in one transaction; a concurrent walk-in for the last Deluxe fails cleanly.
- A 15% discount is refused for front desk alone and succeeds with Tunde's PIN; the audit event carries reason, actor and approver; Tunde can't approve his own.
- Transfer payment requires a reference and appears in the matching queue.
- Check-in of a Ghanaian guest shows the foreign national fields; the passport number is masked in the UI and never returned in plain text.
- Routing sends room and breakfast to the Acme folio and extras to the guest folio; no room charge exists before night audit.
- Blind count hides the expected amount until submission; a non-zero variance requires a reason.
- Offline: check-in of an assigned arrival queues and syncs; walk-in is disabled with its reason.

## Open questions
- Is the **front desk PC a shared device** (PIN sign-in) or a personal device (password + 2FA)? DOMAIN names only POS and housekeeping devices as shared.
- The seed doesn't define the **Acme Corporate rate**. This assumes Deluxe ₦105,000.00 per night including breakfast; add it to the demo world if accepted.
- How is a rate that includes breakfast split between rooms and food revenue at night audit?
- The 208 departure needs a **second Acme guest** and 209 an in-house guest; the demo world names neither.
- Can a key be issued before a bank transfer is matched? Up to what amount, and by whom?
- Does Acme's credit check count charges already routed to Acme on open folios (Mr Mensah's stay), or only invoiced city ledger balances?
- The city ledger is stage 5, but stage 1 check-out needs "settle to city ledger". Bring a basic city ledger account into stage 1?
- Does the 60-second walk-in target include the transfer reference and printing the registration card?
- Should the ECOWAS visa exemption be a fixed option on the registration form or free text?
