# Availability and new reservations

- **Status:** approved (owner, 2026-11-26, see Decisions)
- **Stage:** 1 (brick 4 of the plan in [stage-1-plan.md](stage-1-plan.md)). Depends on brick 1 (room types and rooms), brick 1b (hotel switch), brick 2 (rate plans: `quoteStay`, `listBookablePlans`) and brick 3 (taxes: `rulesInForceFor`, `taxLines`; FX: `fxRateFor`, `fxEquivalent`; the guest transfer account). Feeds brick 5 (approvals for over-limit discounts), brick 6 (modify, cancel, no-show re-lock the same inventory rows and read the stored terms), brick 7 (tape chart reads stays; out-of-order rooms reduce the same rows), brick 8 (arrivals, check-in and walk-in reuse the booking service), brick 10 (deposits are collected against the deposit due recorded here), brick 13 (night audit posts each stay's stored nightly price), brick 15 (reports), brick 16 (discount exceptions), brick 17 (future reservations import through the same service and locks).
- **Module:** Reservations & Front Desk (`docs/PRODUCT.md` module 1: reservations, availability, deposits and guarantees)
- **Walkthroughs:** `front-desk-morning.md` new step 6a and "What can go wrong" (changed, listed under "Changes needed in walkthroughs"); `guest-stay.md` step 1 (a Stage 1 note); `journeys/README.md` demo world (seeded reservations). Read later by `front-desk-morning.md` steps 3, 7–8, `night-audit.md` steps 3–5 and golden-thread hops 1, 4 and 8.
- **Screens:** New reservation (#4, `NewReservation.dc.html`; stepper from `DSComponents.dc.html`); Reservation detail (#5, `ReservationDetail.dc.html`, `ReservationMobile.dc.html`; `AuditOnReservation.dc.html` for the audit sheet); Reservations list and search (pattern: "Table · the one list pattern" in `DSComponents.dc.html`); the deferred **Guest pays per night** column on the first-rate table (#19, `OnbRate.dc.html`) and the rate plan editor preview (#33, `RatePlanEdit.dc.html`). Not this brick: the override dialog with manager PIN (`ReservationDetailAfter.dc.html`, brick 5), Modify / Cancel (#31, brick 6), Room move (brick 7), Check in (#6, brick 8).
- **Decisions:** `0004-money-folios-and-ledger.md`, `0006-business-date-and-night-audit.md`, `0007-availability-locking-and-ota-overbookings.md`, `0008-permission-limits-approvals-audit.md`, `0009-offline-first-operations.md`, `0013-designs-as-source-of-truth.md`, `0018-permissions-and-audit-in-practice.md`, `0021-feature-switches.md` (behind `front_desk`), `0022-shared-devices-and-pin.md`. No new decision record unless the owner moves away from a recommended default below.

## Problem
When a guest calls or sends a WhatsApp asking "Do you have a Deluxe for 9 to 12 December, with breakfast?", the agent today checks a paper chart or the old PMS, works out the price with taxes on a calculator, writes the booking in a book or a spreadsheet, and hopes nobody else sold the same room in the meantime. Prices quoted differ by agent, the deposit and cancellation terms the guest agreed to are not written anywhere, and a cheap "friend's price" looks the same as a real rate. Vento can price a stay (brick 2) and tax it (brick 3), but nobody can yet see how many rooms are left on each night, book one so that it is really gone, or find the booking again when the guest calls back.

## Persona and job
- **Front desk agent** (Chiamaka Eze, shared front desk PC 1, PIN session): takes phone, WhatsApp and email bookings between check-ins, 10–40 a day at Kora Victoria Island, often with a queue at the desk. Needs the answer ("2 left, ₦617,400.00 for 3 nights incl. taxes") in seconds and the booking done in about a minute. Looks reservations up by name, phone or number many times a day.
- **Revenue manager** (Sade Bakare, laptop) and **GM** (Tunde Bello): take some bookings themselves (corporate callers, VIPs), give the larger discounts within their limits, and watch what is selling.
- **Finance** (Kunle Ade) and **owner** (Mrs Adaeze Okafor): read reservations and deposits due; the owner sees every discount the next morning (brick 16).
- **Night auditor** (Ibrahim Musa): reads tomorrow's arrivals and deposits due (brick 13).

## Success looks like
- A phone booking for a returning room type and plan, from **New reservation** to booked: **under 90 seconds and about 10 clicks** (keyboard only also works: Enter moves through every step).
- Rooms left per room type per night shown for any dates in **under 300 ms** (p95, 4 room types × 30 nights).
- **Zero overbookings** at the desk: the concurrency test books the last room from two connections 200 times and exactly one succeeds every time; a randomised test with more requests than rooms ends with booked = rooms + overbooking limit, never more, and the counters equal the stays.
- Every stay stores the **plan price** and the **sold price** for every night, plus the terms the guest accepted; changing a rate afterwards changes no stored stay (test).
- Every discount carries a reason and a name, and is within the person's limit; none can be saved over it (server test).
- Any reservation found by name, phone or number in **under 5 seconds** from the list (search under 300 ms).
- All money in `numeric(14,2)` with its currency, computed with the decimal helpers, rounded once; quoted totals equal the sum of nightly prices plus tax lines to the kobo (property-based test).

## User flow
Chiamaka Eze, front desk, PC 1 at Kora Victoria Island, Wednesday 25 Nov 2026 at 10:32, business date 25 Nov 2026. Ms Sarah Collins (British) calls for 9–12 Dec. (In `guest-stay.md` she books online; the booking engine comes in Stage 4, so in Stage 1 the same booking is taken by phone.)

1. **Reservations** in the sidebar, then **New reservation** (or N on the list) (click 1). A side sheet opens, full width on phones: **Dates & guests**. Arrival is pre-filled with the business date, departure +1 night, 2 adults, 0 children, 1 room. She picks 9 Dec and 12 Dec in the range picker (clicks 2–3), sets 1 adult (click 4). The step summary reads "Wed 9 Dec → Sat 12 Dec 2026 · 3 nights · 1 adult". **Continue** (click 5).
2. **Room & rate.** One card per room type in sort order, each with **Left per night** badges (9, 10, 11 Dec):
   - Standard Queen 6 · 5 · 5, from ₦120,000.00
   - Deluxe King 7 · 5 · **3** (amber), expanded because it is the first type with plans: Best available ₦150,000.00 /night, ₦551,250.00 total incl. taxes · Bed & breakfast ₦168,000.00 /night, ₦617,400.00 total incl. taxes · Non-refundable ₦135,000.00 /night, ₦496,125.00 total incl. taxes
   - Executive King 12 · 11 · 9
   - Junior Suite 2 · **1** · **0**, muted, "Sold out 11 Dec"
   She clicks **Bed & breakfast** (click 6). The summary on the right fills: three nights at ₦168,000.00, Room & breakfast ₦504,000.00, service charge 10% ₦50,400.00, VAT 7.5% ₦37,800.00, Lagos consumption tax 5% ₦25,200.00, **Total ₦617,400.00**; **Deposit due ₦205,800.00**, "First night incl. taxes, by 27 Nov 2026, 10:32"; **Cancellation** "Free until Mon 7 Dec 2026, 14:00. After that, or no-show: first night, ₦205,800.00." **Continue** (click 7).
3. **Guest.** She types "Collins". No match in the group. She types first name Sarah, last name Collins, title Ms, phone `+44 7700 900123` and picks nationality **British** (click 8). **How they booked** is already **Phone** (last used at this desk). The summary adds "≈ £316.62 at ₦1,950/£, CBN, 25 Nov 2026" and the tag **Foreign national**. **Continue** (click 9).
4. **Review & book.** Everything on one page: guest, stay, plan and its terms, nightly prices with tax lines, deposit due and cancellation. **Book · ₦617,400.00** (click 10).
5. The sheet closes on the new **reservation detail**: "Sarah Collins · Confirmed · VI-2611-0483", deposit due ₦205,800.00 by 27 Nov 2026, 10:32 (amber). Toast "Booked VI-2611-0483 for Sarah Collins". She clicks **Copy confirmation** and pastes it into WhatsApp: "Kora Victoria Island: Hello Sarah, your booking is confirmed. Deluxe King, Bed & breakfast, 9–12 Dec 2026 · 3 nights, ₦617,400.00 incl. taxes. Confirmation VI-2611-0483. To guarantee your room, please pay a deposit of ₦205,800.00 by 27 Nov 2026 to Zenith Bank 0123454471 (Kora Hospitality Ltd) with reference VI-2611-0483. Free cancellation until 7 Dec 2026, 14:00. Check-in from 2pm at Plot 1412 Ahmadu Bello Way, Victoria Island."

Deluxe King on 11 Dec now shows 2 left on every screen that loads it.

**Variant, discount.** Ms Collins asks for 15% off. On **Room & rate**, Chiamaka clicks **Change rate** under the summary, types 15 in **Discount**. Inline: "15% is over your 12% discount limit. Use up to 12%, or ask a manager with a higher limit to make this booking." (Brick 5 adds **Ask for approval** here.) She types 10, picks the reason **Repeat guest**. The summary shows "₦168,000.00 → ₦151,200.00 a night · 10% off Bed & breakfast", Total ₦555,660.00, deposit ₦185,220.00. Booking it writes a discount audit event that is in the next owner's daily report (Open question 3).

**Find it again.** At 16:00 Ms Collins calls back. Chiamaka types "collins" (or "0483", or "+44 7700") in the list search: one row, opens it (2 clicks).

## Acceptance criteria

### Main path
**What this brick delivers**
1. Inventory per room type per date, rooms left, and the locked booking transaction (the **booking service** every later booking path uses: walk-in, group, import, booking engine, OTA).
2. **New reservation** (#4) for one room, with discounts within the member's limit and restriction book-through with a reason.
3. **Reservations** list with search and the **reservation detail** (#5, read-only in this brick) with **Copy confirmation**.
4. A minimal group-wide **guest** record.
5. The deferred **Guest pays per night** column (#19) and editor preview column (#33).
6. Demo seed reservations, including nearly sold-out dates.

**Availability**
- **Rooms left** for a room type on a night = active rooms of that type − rooms out of order that night (from brick 7; 0 until then) − rooms booked that night. A night is the stay date (the 9 Dec night runs from 9 to 10 Dec).
- **Bookable** = rooms left + the room type's **overbooking limit** (default 0; Open question 4). A booking needs bookable ≥ 1 on every night of the stay for its room type (≥ the number of rooms of that type in the request).
- Shown as **Left per night** badges: a number per night for stays up to 14 nights (longer stays show the lowest with its date, "2 left on 4 Dec"); amber at 3 or fewer, rose "0" when none; the card says "Sold out 11 Dec" (or "Sold out 3 nights") and can't be picked. Rooms left never show below 0, even if an overbooking or a later out-of-order room makes the count negative (the tape chart, brick 7, shows the shortfall).
- Room types that can't take the party show muted "Sleeps 2 adults" and can't be picked (from the room type's max adults and children, as `quoteStay` checks). Archived room types and types with no active rooms aren't listed.
- Counts are **live**: the step reloads them when it opens, every 30 seconds while open, when the window regains focus, and after any refused booking. The final check is always the locked one at **Book**.

**Plans and prices on Room & rate**
- Each room type lists `listBookablePlans` in the hotel's plan order: name, a tag for derived plans ("BAR + ₦18,000", as in the design), meal plan and the cancellation line ("Room only · free cancellation until 7 Dec 14:00", "Paid in full at booking"), price per night and total incl. taxes. When nightly prices differ across the stay, the card shows "avg ₦158,333.33 /night".
- The **Excl. taxes / Incl. taxes** switch (design) changes the per-night figure on the cards only; totals always show incl. taxes. Remembered on the device.
- Corporate-only plans aren't listed until brick 12 (the design's muted "Corporate · Acme Energy Ltd" row comes then).
- A plan whose restriction the stay breaks (closed, closed to arrival, min stay) is listed with an amber line from `quoteStay`'s message ("Min stay 2 nights from Sat 5 Dec") and can be picked; **Review & book** then asks for a reason (rates decision 11: a warning at the desk, an audit event, not an exception).
- No plan sells the room type for those dates: "No rates for Junior Suite on these dates." with no plans listed.

**The quote** (server, the one place prices, taxes and deposits are computed for a booking)
- For the chosen plan and stay: `quoteStay` (nightly prices, plan terms, breaks, `quoteHash`) inside the request's transaction.
- Tax lines per night: the room part (price + extra adult − meal allocation) as category `accommodation` and the meal allocation as `food`, each through `taxLines` with the rules from `rulesInForceFor(hotel, night date)`, pricing `inclusive` or `exclusive` from the plan's terms. A scheduled change applies to the nights it covers (a 1 Jan 2027 night at Kora Victoria Island gets the 12.5% service charge). The procedures call `rulesInForceFor` directly and never `taxRulesInForce` / `quoteTaxLines`, which require the taxes read permission the front desk doesn't have.
- Totals: nightly net, each tax summed by tax across the stay (shown in the fixed order service charge, VAT, state taxes), rounding lines inside the breakdown only, and the total. Total = Σ nights (net + lines + rounding), to the kobo.
- **Deposit due** from the plan's deposit rule on the gross nightly amounts: none → no deposit; first night → night 1 gross; N% of the stay → N% of the total, rounded half-up to the kobo once; full stay → the total. **Due at**: at booking → the booking time; within N hours → booking time + N hours, or the hotel's check-in time on the arrival day if sooner.
- **Cancellation deadline** for display and storage: the hotel's check-in time on the arrival day − N hours; penalty amount from the policy (first night gross, N% of the total, or the total).
- A hotel whose taxes aren't set up refuses to quote: "Kora Abuja's taxes aren't set up yet. Ask finance to set them up." (`TAXES_NOT_SET_UP`).
- **Foreign equivalent:** once the guest's nationality is known and isn't Nigerian, the summary adds `fxEquivalent(total, fxRateFor(currency, business date))` with currency GBP for British nationals, EUR for euro-area nationals and USD for everyone else (a fixed map in `@vento/shared`). No rate for that currency: no line. Display only; nothing foreign is stored, and bills are always naira (brick 3, Decision 2). The duplicate `foreignEquivalent` in `packages/shared/src/rates.ts` is removed and its tests moved to `fxEquivalent` (polish backlog item closed).

**Discounts (within the limit)**
- **Change rate** on Room & rate opens two linked fields: **Discount** (%, up to 2 decimals) and **Rate per night** (₦). Typing one fills the other from the plan price of the first night. The discount applies to every night: sold price = plan price × (1 − %) per night, kept as a `Decimal` and rounded once, half-up, to the kobo; a typed rate per night is the same on every night and its % is measured per night.
- **Reason** is required: pills from the design (**Repeat guest**, **Corporate rate match**, **Long stay**, **Service recovery**, **Other**, with text required for Other) plus an optional note. "Recorded with your name. This shows in the owner's daily report."
- **Limit:** the largest discount on any night, (plan price − sold price) ÷ plan price, must be within the member's `stay.rate_override` limit (front desk 10% by default, 12% in the demo seed; revenue manager 25%; GM 50%; owner and group admin any). Checked on the device for the message and again on the server inside the booking transaction against the stored limit.
- **Over the limit:** the field shows the message in the user flow and **Continue** stays disabled until it is within the limit or removed. The server refuses with `DISCOUNT_OVER_LIMIT` (data: requested %, limit). Brick 5 replaces the dead end with **Ask for approval** (approver PIN on the same device or the approvals inbox; nobody approves their own). This is the one place the brick doesn't meet UX-STANDARD §4 "over-limit actions offer approval", and it is listed in the pull request.
- The sold price can't be above the plan price ("To charge more, pick another plan."), can't be ₦0 ("A free night is a comp. Comps come with folios."), and can't leave a night below its meal allocation ("Bed & breakfast's breakfast part is ₦18,000.00 a night, so the rate can't go below it.").
- Each stay stores, per night, the **plan price** and the **sold price**, and on the stay the discount %, the reason and who gave it.

**Guest step**
- **Find a guest:** typing 3 or more characters of a name, phone or email searches the group's guests (at most 5 matches: name, nationality, masked phone `+234 803 ••• 4567`, last stay hotel and date once brick 8 records stays). Picking one fills the step; the details can be corrected (the change updates the guest record and is audited).
- **New guest** fields: title (optional; suggestions Mr, Mrs, Ms, Miss, Dr, Prof, Chief, Alhaji, Alhaja, Engr, Barr, or typed), first name (required), last name (required), phone (E.164; a Nigerian number typed as `0803…` is stored as `+234803…`), email, nationality (country list, pre-filled **Nigerian**). Phone or email is required ("Enter a phone number or an email, so the hotel can reach the guest."). Nothing else: ID, address and the foreign national details are taken at check-in (brick 8); preferences, VIP and notes on the profile come with Stage 4.
- **How they booked** (reservation source): **Phone** (`phone`), **WhatsApp** (`whatsapp`, new), **Email** (`email`), **In person** (`direct`). Pre-filled with the last one used on this device. Walk-in (`walk_in`) is brick 8; the others come with their channels.
- **Notes** (optional, up to 500 characters): "Quiet room, late arrival around 22:00." Shown on the detail and, from brick 8, on arrivals.

**Review & book**
- Shows guest, stay, room type, plan and its terms in words, the nightly table with tax lines, totals, deposit due and cancellation; any restriction broken with its **Reason** field (required); any discount with its reason.
- **Book · ₦617,400.00** (⌘↵). One request with an idempotency key made when the sheet opened; pressing twice, or a retry after a timeout, returns the same reservation.
- The request carries the `quoteHash` of what was shown. If the server's quote differs (a price or term changed meanwhile), nothing is saved and the step shows the new figures: "The price changed since you quoted it: Bed & breakfast is now ₦175,000.00 a night. Check the new total with the guest and book again." (`PRICE_CHANGED`).
- **Draft:** the sheet's input is kept in memory for the session ("Draft saved 10:33", as in the design), so closing it by mistake and reopening restores it. It is never written to the device's storage (guest details on a shared PC), and it is cleared on Book, **Discard draft**, sign-out and hotel change (the leave guard asks first: "Discard this booking?"). A draft holds no rooms.

**The booking transaction** (one database transaction, in this order)
1. Resolve the hotel from the member's scope (`PROPERTY_NOT_FOUND` outside it, `PROPERTY_ARCHIVED` for an archived hotel) and the `front_desk` switch.
2. Take the hotel's rates lock in shared mode (inside `quoteStay`), so prices can't change until commit.
3. Insert any missing inventory rows (`ON CONFLICT DO NOTHING`), then lock every row the request needs with `SELECT … FOR UPDATE`, ordered by room type id, then date.
4. For each room type and night: bookable = active rooms − out of order − booked + overbooking limit; refuse with `SOLD_OUT` (data: room type, first short date, rooms left) if any is short.
5. `quoteStay` per stay; compare `quoteHash`; check restriction reasons, the discount limit and the rules above; compute tax lines, totals, deposit due and the cancellation deadline.
6. Find or create the guest; take the next reservation number from the hotel's counter row (`FOR UPDATE`); insert the reservation, its stays and stay nights; add 1 to `booked` on each locked row.
7. Write the audit events; commit. Only then is the booking visible.
- **Lock order everywhere** (to rule out deadlocks): (1) the hotel's rates advisory lock, (2) inventory rows by room type id then date, (3) the reservation counter. Any code that takes more than one takes them in this order.
- **Room count changes now respect bookings** (change to brick 1): archiving a room, moving a room to another type, or archiving a room type locks that type's inventory rows from the business date on (after the rates lock) and is refused if any night would go below what is booked plus the overbooking limit: "Deluxe King would be 1 room short on 11 Dec (48 booked, 47 rooms). Move or cancel a booking first." (`ROOMS_BOOKED`). Adding rooms needs no check.
- **Rate plans:** a plan used by a stay now has history, so **Delete for good** is refused (brick 2's rule, filled in here; batched per list, polish backlog).

**What gets stored**
- **Reservation:** number, hotel, status `confirmed` (Open question 1), source, main guest, guarantee (`deposit` when the plan's rule asks for one, else `none`), deposit due (amount, currency NGN, due at) or none, quoted total incl. taxes (for reference; folios are the bill from brick 10), notes, booked by, device, business date booked, idempotency key.
- **Stay:** guest (the main guest in this brick), room type, rate plan and its version, arrival, departure, adults, children, room (empty; assignment comes with bricks 7 and 8), status `confirmed`, `quoteHash`, discount (%, reason, by), restriction override (kind, date, reason), and the **terms snapshot**: plan name and code, meal plan, meal allocation, cancellation policy and the computed deadline, deposit rule, prices include taxes. Later rate or plan changes never alter it.
- **Stay night:** one row per night: date, plan price, sold price, extra adult, meal allocation, where the price came from (date price or standard price), currency.
- Tax lines aren't stored on stays: they belong to postings and are computed on each night's business date at night audit (brick 13). The detail page recomputes them with the rules in force for each night, so a scheduled tax change shows on the nights it covers; the deposit due stays as computed at booking.

**Reservations list** (`/reservations`, a group page)
- Sidebar **Reservations** (design `active="res"`), shown to members who can read reservations.
- Header: eyebrow with the scope ("Kora Victoria Island" / "All hotels"), title "Reservations", **New reservation** (N), for members with `reservation.manage`.
- Views (segmented, as in the pattern): **Upcoming** (default: departure after the business date, not cancelled), **Booked today** (booked on the current business date, any arrival: what the owner checks for leakage), **All**.
- Search (/ to focus): name, phone, email or reservation number (any 3+ characters, or the number's last digits).
- Filters (pills): Status, Room type (one hotel only), How they booked, Arrival dates, Deposit due. No in-page hotel filter: the hotel switch is the only one.
- Columns: Guest (with **Foreign national** tag), Booking (number), Stay (`9–12 Dec 2026 · 3 nights`), Room (room type and "Not assigned" until brick 7/8), How they booked, Status (badge), Deposit (amber "₦205,800.00 due 27 Nov", or "—"), Total (incl. taxes). With All hotels a **Hotel** column comes first. Below `md`, rows become cards (guest, number, stay, status, total).
- Sorted by arrival, then guest name (Booked today: newest first). Server-paginated, `{ items, page, pageSize, total }`, 50 a page. Clicking a row opens the detail page; links carry `?hotel=`.
- No bulk actions, column picker or export in this brick (the design pattern's "Assign rooms" and "Send WhatsApp pre-arrival" come with bricks 7–8 and Stage 4; exports are reports, brick 15).

**Reservation detail** (`/reservations/:id`, read-only in this brick)
- Breadcrumb "Reservations / VI-2611-0483". Header: avatar initials, guest name, status badge, tags (**Foreign national**), "Booked 25 Nov 2026 by Chiamaka Eze · Phone".
- Summary row (design `g5`): **Stay** (dates and nights), **Room** (room type, "Not assigned"), **Rate** (sold price per night, or "avg"; plan · meal plan), **Stay total** (incl. service charge and taxes), **Deposit** ("₦205,800.00 due by 27 Nov 2026, 10:32" amber; "Not required"). The design's **Balance** comes with folios (brick 10).
- **Rate per night** card: Night · Plan · Room (& breakfast) · Service · VAT · Consumption · Total, a total row, and the line "Plan price ₦168,000.00 · 10% discount, Repeat guest (Chiamaka Eze)" when discounted. Columns follow the taxes in force; the header line reads "Taxes use the rates in force on each night."
- **Guest** card: nationality, phone, email (no passport until brick 8). **Guarantee and deposit** card: guarantee, deposit due and by when, the cancellation line ("Cancelling now is free until 7 Dec 2026, 14:00. After that: first night, ₦205,800.00.").
- **Activity** from the reservation's audit events (created, discount, restriction booked through, guest details corrected), newest first. **Audit trail** opens the audit sheet (as on rooms) for members with `audit.view`.
- Actions in this brick: **Copy confirmation** only. Modify and Cancel (brick 6), Room move (brick 7) and Check in (brick 8) appear with their bricks; nothing links to what isn't built.
- **Copy confirmation** copies the guest message (UI copy below) built on the device from the detail: property name, guest first name, room type, plan, stay, total, number, the deposit line with the hotel's guest transfer account (bank, full account number, account name, reference = reservation number) when a deposit is due, the cancellation line and check-in time and address. No guest transfer account: the deposit line says "The hotel will send payment details." and the copy toast adds "No transfer account is set for this hotel." Toast "Confirmation copied". Nothing is sent by Vento in this brick.
- Phone (`ReservationMobile`): the same sections stacked; desk bottom navigation.

**Guest pays per night** (deferred from brick 2)
- First-rate table (#19): the **Guest pays per night** column shows each typed weekday price plus tax lines from `rulesInForceFor` on the business date ("₦183,750.00"), the Bed & breakfast line in the aside likewise. Taxes not set up: "Set up taxes to see what guests pay".
- Rate plan editor preview (#33): a **Guest pays** column beside each room type's price, using the plan's inclusive/exclusive setting. Both are read with the rates page's own permissions, which already include reading taxes.

**Home**
- A hotel Home gains **New reservation** among the quick actions for members with `reservation.manage` (as in `OnbHome`). Arrivals counts, deposits due and the rest of the front desk Home come with brick 8.

### Organization isolation
- Inventory rows, reservations, stays, stay nights, guests and counters carry `organizationId`; every query filters by the organization from the auth context. An id from another group answers "not found". Search never crosses groups. The idempotency key is unique per organization.

### Property scoping
- Reservations, stays, nights, inventory and counters belong to a hotel. A member limited to Kora Victoria Island and Kora Ikeja GRA (Sade) sees and books only those; `reservations.get` for a Kora Abuja reservation answers `PROPERTY_NOT_FOUND`. A PIN session sees only its device's hotel.
- Guests are group-wide (one profile across the group, `docs/DOMAIN.md`): any member who can create reservations at any hotel can find and pick any guest of the group, but the guest's stays at hotels outside their access are never shown or hinted (no "last stay at Kora Abuja" for Sade).
- **Hotel switch:** the list is a **group page** (one hotel: its reservations; All hotels: every accessible hotel, with the Hotel column). **New reservation** with All hotels starts with a required, empty **Hotel** field on Dates & guests ("Which hotel?"); with one hotel selected it is that hotel and the field isn't shown. Changing the hotel closes an open sheet through the leave guard and returns the list to page 1. Empty and error states name the hotel.

### Permissions, limits and approvals
No new matrix rows.
- **Create a reservation, search and pick guests, give a discount within the limit, book through a restriction with a reason:** `reservation.manage` (front desk, revenue manager, GM, owner / group admin). Allowed in a PIN session on a shared front desk PC.
- **Discount:** `stay.rate_override`, limit in % per role from the stored matrix (seed defaults front desk ≤ 10%, revenue manager ≤ 25%, GM ≤ 50%, owner / group admin any; the demo seed raises front desk to 12%). Measured per night against the plan price. Over the limit: refused in this brick; approval with brick 5, where the server re-checks both limits and that the approver isn't the requester.
- **Read reservations (list, detail, search):** comes with `reservation.manage`, `night_audit.run` or `leakage.view` (front desk, revenue manager, GM, finance, owner / group admin). Proposed note for the matrix in `docs/DOMAIN.md`; read-only for the last two. Cashiers, waiters, housekeeping and maintenance can't read guests' contact details.
- **Overbooking past the limit:** not possible for anyone at the desk (Decision 0007: only OTA bookings may go past it, from Stage 4). No row needed while the limit isn't editable (Open question 4).
- Gated by the `front_desk` feature switch. Permission denied: "Only front desk, revenue managers, GMs and the owner can make reservations. Ask your GM." / reading: "You don't have access to reservations. Ask your GM."

### Audit events
All in the booking transaction, with actor, device, property, business date, before/after and reason where given:
- `reservation.created`: number, status, source, guarantee, guest id, deposit due (amount, due at), quoted total, idempotency key, and per stay the room type, plan and version, dates, guests, nightly plan and sold prices, `quoteHash`. `after.liveProperty` set from the hotel.
- `guest.created` (fields, phone and email included; audit events are internal and never logged to pino or Sentry) and `guest.changed` (before/after) when a picked guest's details are corrected.
- `stay.discount_applied`: reservation and stay, plan price and sold price per night, %, limit at the time, reason, approver (empty in this brick), and `exception: 'discount'` (Open question 3).
- `stay.restriction_overridden`: restriction kind, date, plan, reason. Audit only, no exception (rates decision 11).
- Brick 1's room and room type events gain nothing new; a refused change (`ROOMS_BOOKED`) writes nothing.

### Leakage exceptions
- **Discount** (existing exception type): every stay booked below its plan price, with name, amount and reason. Owner's daily report line (brick 16): "Discount · Kora Victoria Island · VI-2611-0483 Sarah Collins · Deluxe King · 10% (₦168,000 → ₦151,200 a night, ₦50,400 over 3 nights) · Chiamaka Eze · Reason: repeat guest". With approval (brick 5): "… · Approved by Tunde Bello". Before go-live the event is written with `liveProperty: false` and doesn't reach the report.
- **Rate below plan** can't happen any other way: the price always comes from `quoteStay`, so a lower price is a discount. The brick 2 "rate lowered for tonight" exception still catches cutting tonight's rate, booking, and raising it again.
- **Booked today** on the list lets the GM see every booking taken on the business date with its agent, discount and source.

### Offline behaviour
- New bookings need a connection: availability is only true on the server. Offline, **New reservation** is disabled with "Needs a connection to check live availability"; an open sheet keeps its draft and **Book** is disabled with the same words; nothing is queued.
- The list and detail show the last loaded data read-only under the app's offline banner, with "Offline since 17:32. New bookings need a connection to check live availability. Last updated 17:31." Search works only on rows already loaded ("Search needs a connection. Showing the rows loaded at 17:31.").
- A booking sent just before the connection dropped is retried with the same idempotency key when the connection returns, if the sheet is still open; the person sees "Checking whether VI-… was booked…" and then the result, never a second booking.

### Business date
- Arrival must be on or after the hotel's business date (`PAST_DATE`: "9 Dec 2026 is before the business date (10 Dec 2026). Pick a new arrival date."). After midnight, before night audit, an arrival on the old business date is still allowed (the guest arriving at 00:40 is that day's arrival). Same-day bookings are allowed; departure must be after arrival (day use is out of scope).
- Stays can end at most 2 years after the business date and last at most 365 nights (`TOO_FAR_AHEAD`, `STAY_TOO_LONG` from `quoteStay`).
- The deposit's due time is a clock time (UTC `timestamptz`, shown in the hotel's time zone); stay dates are `date`. The reservation records the business date it was booked on, which **Booked today** uses.
- Tax lines on the quote use the rules in force on each night's date; night audit (brick 13) posts with the rules in force on the business date it closes, which is the same date.

### Tax lines
- From configuration only, through `taxLines` and `rulesInForceFor` (brick 3). Room part `accommodation`, meal allocation `food`. Each line rounded once, half-up, to the kobo; inclusive plans back out the net with any rounding difference on a rounding line inside the breakdown. Lines appear as service charge, VAT, then state taxes.
- Every price shown is labelled "excl. taxes" or "incl. taxes"; every total the guest hears or receives includes the tax lines (rates Open question 20 still stands for the law on advertised prices).
- Illustrative rates in this spec (VAT 7.5%, Lagos consumption tax 5%, service charge 10%) are seed values **to verify** against current law; tests read them from configuration.

### Foreign currency
- Bills, quotes, deposits and stored prices are NGN. Foreign guests see a display-only equivalent with rate, source and date (`≈ £316.62 at ₦1,950/£, CBN, 25 Nov 2026`), never stored. A stale rate shows its date ("CBN, 20 Nov 2026"). Deposits in foreign cash are taken in brick 10 at the day's rate.

### Availability locking
- One inventory row per hotel × room type × date holding `booked`; created on first use; changed only inside a transaction that holds `FOR UPDATE` on it, in the order room type id, then date.
- Overbooking limit per room type, default 0, stored as configuration on the room type (not editable in this brick; Open question 4).
- **Last-room test** (`apps/api/src/reservations/book.concurrency.test.ts`, against the test database): Junior Suite with 1 room left on a date; two connections each run the booking transaction, synchronised to reach the lock together; exactly one commits, the other gets `SOLD_OUT`; `booked` = 8; one stay night exists for that date and type. Repeated 200 times.
- **No-deadlock test:** booking A (Standard Queen + Deluxe King, multi-stay through the service) and booking B (Deluxe King + Standard Queen) race 200 times; both succeed or one gets `SOLD_OUT`, never a deadlock error.
- **Counter invariant test:** after random concurrent bookings, for every row `booked` equals the number of stay nights of non-cancelled stays of that type and date, and never exceeds rooms + limit.
- **Room count test:** archiving a Deluxe King room while 48 of 48 are booked on 11 Dec is refused; racing an archive against a booking for the last room leaves rooms ≥ booked.

### Empty, error and edge cases
- **No reservations at the hotel:** "No reservations at Kora Abuja yet. Bookings taken here, on the phone or at the desk, show in this list." → **New reservation**. Filtered empty: "No reservations match these filters." → **Clear filters**. Search empty: "No reservations for “Collins” at Kora Victoria Island."
- **Hotel not ready to sell:** no rooms: "Kora Abuja has no rooms yet. Rooms are set up in Rates & channels." (link for `rooms.setup`); no rates: "No rates set for Kora Abuja yet. Ask your GM to set rates."; taxes not set up: the `TAXES_NOT_SET_UP` message. Each replaces Room & rate with that one message.
- **Sold out while booking:** "Deluxe King was just sold for 11 Dec. 2 Executive King rooms are free for these nights." The step reloads counts; the draft and guest details stay. Nothing is saved.
- **All types sold out for the dates:** "Fully booked for 11 Dec. Overbooking limit reached." with the nights that are free on either side ("Rooms are free from 12 Dec.").
- **Price or terms changed meanwhile:** `PRICE_CHANGED` message above, with the new figures.
- **Plan or room type archived meanwhile:** "Bed & breakfast was archived a moment ago. Pick another plan." / "Deluxe King was removed a moment ago. Pick another room type."
- **Business date rolled while the sheet was open** (arrival now in the past): the `PAST_DATE` message on Dates & guests.
- **Too many guests:** "Deluxe King sleeps 2 adults and 1 child." on the card.
- **Corporate-only plan sent by a crafted request:** refused, "Acme Energy is for corporate accounts. Corporate bookings come with corporate accounts." (`PLAN_CORPORATE_ONLY`).
- **Discount errors:** over limit, above plan price, ₦0, below meal allocation (copy above).
- **Restriction reason missing:** "Give a reason for booking through the min stay."
- **Guest:** neither phone nor email: the message above; invalid phone: "Enter the phone number with its country code, e.g. +44 7700 900123, or a Nigerian number starting 0."; invalid email: "Enter an email like name@example.com". Two guests with the same phone: both are offered; picking one is the agent's choice (merging duplicates is Stage 4, #41).
- **Same guest, overlapping stay at the same hotel:** allowed (two rooms), with a note on Review: "Sarah Collins already has VI-2611-0471 for 10–11 Dec." so accidental double entries are caught.
- **Idempotency key reused with a different booking:** refused, "This booking was already made as VI-2611-0483." with a link.
- **Long names and numbers:** truncate with a tooltip; amounts up to ₦999,999,999.99 fit the summary; 365-night stays show the nightly table paged by month.
- **Load error:** "Couldn't load availability. Nothing was booked." → **Try again**; list: "Couldn't load reservations at Kora Victoria Island." → **Try again**.
- **Archived hotel:** its reservations stay readable; New reservation is hidden ("This hotel was archived.").

## Behind the scenes
- **Folio postings:** none. No folio exists until check-in (brick 8) or a deposit (brick 10). The deposit due is a figure on the reservation, not money.
- **Night audit (brick 13):** posts each in-house stay's stored sold price for the night (room part and meal allocation split), with tax lines computed then. Night audit doesn't read rate plans. No-shows (brick 13 / 6) read the stored terms.
- **Ledger:** none until Stage 5.
- **Jobs:** none. No confirmations are sent by Vento (WhatsApp and email confirmations come with guest messages, Stage 4); no ARI pushes until channels (Stage 4), which read these same inventory rows after commit.
- **Notifications:** none in app. Discounts reach the owner's daily report (brick 16).
- **Data import at go-live (brick 17):** future reservations go through this booking service and its locks, with the nightly prices sold in the old PMS (not re-quoted), a terms snapshot from the import file or the plan, deposits held from brick 10, guests matched or created, and the source reference as the idempotency key ("already exists" on re-import). The service is built so the price source is either `quoteStay` or given nightly prices; the given path is internal (seed and import only), not reachable from the API.
- **Code layout:** `apps/api/src/reservations/` (availability reads, quote, booking transaction, list, detail, guests), contracts and schemas in `packages/shared/src/reservations.ts` and `guests.ts`, pure quote maths (tax lines per night, deposit, cancellation deadline, discount) in `@vento/shared` so the summary on the device matches the server.

### Data model sketch
All with `id` (UUID v7), `organizationId`, `createdAt`, `updatedAt`; money `numeric(14,2)` with a `currency` column (`NGN`).

| Table | Columns (beyond the above) | Keys and checks |
|---|---|---|
| `room_type_inventory` | `propertyId`, `roomTypeId`, `date` (date), `booked` (int ≥ 0) | unique (`roomTypeId`, `date`); index (`propertyId`, `date`) |
| `room_types` (existing) | + `overbookingLimit` (int, default 0, ≥ 0) | |
| `guests` | `title`, `firstName`, `lastName`, `phone` (E.164), `email`, `nationality` (ISO 3166 alpha-2), `archivedAt` | index on (`organizationId`, `phone`), (`organizationId`, lower(`email`)), trigram on names for search |
| `reservations` | `propertyId`, `number`, `status`, `source`, `guestId`, `guarantee`, `depositDue`, `depositDueAt`, `quotedTotal`, `currency`, `notes`, `bookedBy`, `bookedOnBusinessDate`, `deviceId`, `idempotencyKey` | unique (`organizationId`, `number`), unique (`organizationId`, `idempotencyKey`); index (`propertyId`, `bookedOnBusinessDate`) |
| `stays` | `propertyId`, `reservationId`, `guestId`, `roomTypeId`, `ratePlanId`, `ratePlanVersion`, `arrival`, `departure`, `adults`, `children`, `roomId` (null), `status`, `quoteHash`, `terms` (jsonb snapshot), `cancellationDeadline` (timestamptz), `discountPercent`, `discountReason`, `discountBy`, `restrictionOverride` (jsonb) | check `departure > arrival`; index (`propertyId`, `arrival`), (`propertyId`, `departure`) |
| `stay_nights` | `propertyId`, `stayId`, `date`, `planPrice`, `soldPrice`, `extraAdult`, `mealAllocation`, `priceFrom` (`date_price` / `standard_price`), `currency` | unique (`stayId`, `date`); append-only in this brick (brick 6 replaces nights on modify through the same lock) |
| `reservation_counters` | `propertyId`, `period` (`YYMM`), `last` (int) | unique (`propertyId`, `period`) |
| `properties` (existing) | + `bookingPrefix` (2–4 capital letters, unique in the group; Open question 5) | |

### API procedures (oRPC, contracts in `@vento/shared`)
| Procedure | Input → output | Permission |
|---|---|---|
| `reservations.availability` | hotel, arrival, departure, adults, children → per room type: nights with rooms left, sellable flag and reason (sold out, too many guests, not priced), bookable plans with per-night and total excl./incl. taxes, terms in words, breaks | `reservation.manage` |
| `reservations.quote` | hotel, room type, plan, dates, guests, discount?, nationality? → nights (plan price, sold price, tax lines), totals by tax, deposit due and due at, cancellation deadline and penalty, FX equivalent, `quoteHash`, discount check (within / over limit, limit) | `reservation.manage` |
| `reservations.create` | idempotency key, hotel, guest (id, or new fields; corrections), source, notes, stays [room type, plan, dates, guests, `quoteHash`, discount?, restriction reason?] → reservation id and number | `reservation.manage` (+ `stay.rate_override` limit for a discount) |
| `reservations.list` | hotel or all, view, search, filters, page, pageSize → `{ items, page, pageSize, total }` | readers |
| `reservations.get` | id → reservation, stays, nights with tax lines recomputed, terms, deposit, guest, the hotel's guest transfer account for the confirmation, activity | readers |
| `guests.search` | text (≥ 3 characters) → up to 5 guests (masked phone) | `reservation.manage` |

`stays` is a list from the start (the UI sends one; Open question 6). Error codes: `SOLD_OUT`, `PRICE_CHANGED`, `DISCOUNT_OVER_LIMIT`, `RESTRICTION_REASON_REQUIRED`, `PLAN_CORPORATE_ONLY`, `TAXES_NOT_SET_UP`, `PAST_DATE`, `TOO_FAR_AHEAD`, `STAY_TOO_LONG`, `TOO_MANY_GUESTS`, `PLAN_ARCHIVED`, `ROOM_TYPE_NOT_FOUND`, `IDEMPOTENCY_CONFLICT`, `ROOMS_BOOKED` (brick 1 paths), plus the existing `PROPERTY_NOT_FOUND`, `PROPERTY_ARCHIVED`.

### Demo seed
Dates relative to the seed's business date D (the walkthroughs assume D = 25 Nov 2026); illustrative. Seeded through the booking service with its locks; reservations on corporate plans use the internal given-price path.
- **Kora Victoria Island**, about 150 reservations over D … D+30 so occupancy looks real (60–80% on most nights), mixed plans, sources (phone, WhatsApp, email, in person) and Nigerian and foreign guests, booked by Chiamaka Eze, Sade Bakare and Tunde Bello on earlier dates:
  - **Mr Daniel Mensah**, VI-2611-0482, Executive King, D → D+3 · 3 nights, plan Acme Energy (`ACME`) ₦180,000.00 room only, source email, no deposit, notes "Quiet room", booked by Tunde Bello on D−7 (golden thread hop 1; room 502 is assigned in brick 7/8).
  - 26 arrivals on D in all (the `front-desk-morning.md` count), not checked in (check-in is brick 8).
  - **Junior Suite:** 7 of 8 booked on D+15 and 8 of 8 on D+16 (a wedding party: individual reservations, notes "Adeyemi–Nwosu wedding"), so a 9–12 Dec search shows "1 left" and "Sold out 11 Dec".
  - **Deluxe King:** 45 of 48 booked on D+16 ("3 left", amber).
  - One reservation by Chiamaka with a 10% discount, reason Repeat guest (so the discount data exists for brick 16); one by Sade booked through the Sat 5 Dec min stay with a reason.
  - Ms Sarah Collins is not seeded: she is the booking the owner makes.
- **Kora Ikeja GRA:** about 20 reservations, so All hotels shows two hotels' rows. **Kora Abuja** and **Kora Port Harcourt:** none (their empty state).
- **Booking prefixes:** VI, IKJ, ABJ, PH (Open question 5).

### Owner's review (what to try)
1. As `chiamaka@kora.example` on PC 1 (PIN): Reservations → New reservation → 9–12 Dec, 1 adult → see Deluxe King "3" amber and Junior Suite "Sold out 11 Dec" → Bed & breakfast → Ms Sarah Collins, British → see the £ equivalent → Book. Deluxe King on 11 Dec now shows 2.
2. Try 15% off: the limit message; then 10% with a reason. Try 5 Dec for one night on Best available: the min stay warning and reason.
3. Copy confirmation and paste it into a WhatsApp chat.
4. Search "collins", "0483" and a phone number; filter Booked today.
5. Open two browser windows on the last Junior Suite for 10 Dec and book both: one succeeds, the other says it was just sold.
6. As `adaeze@kora.example`: All hotels shows Kora Victoria Island and Kora Ikeja GRA rows with the Hotel column; New reservation asks which hotel. Switch to Kora Abuja: the empty state.
7. As `tunde@kora.example`: try to archive a Deluxe King room on a fully booked night; Rate plans: **Guest pays per night** on the first-rate table and the editor preview.
8. Turn off the network: New reservation is disabled with its reason; the list still shows what was loaded.

### Changes needed in `docs/DOMAIN.md`
1. **Reservation** row, notes: "Number `{booking prefix}-{YYMM booked}-{sequence}` (e.g. VI-2611-0483), unique in the group (Open question 5). Source adds `whatsapp`. In Stage 1 the desk creates `confirmed` reservations (Open question 1). Stores the business date it was booked on, the deposit due and when, the quoted total, notes, who booked it and on which device."
2. **Stay** row, notes: "Stores per night the **plan price** and the **sold price**, and the **terms snapshot** (plan name and code, meal plan and allocation, cancellation policy with its deadline, deposit rule, inclusive or exclusive) as sold; rate and plan changes never alter it. A discount is on the stay with %, reason and who gave it."
3. **Availability** row: "Rooms left for a room type on a night = active rooms − out of order − booked. Bookable = rooms left + the room type's overbooking limit (default 0). `booked` is kept on one inventory row per room type per date, changed only under `SELECT … FOR UPDATE` in the order room type, then date. Archiving or retyping rooms is refused when it would leave fewer rooms than booked."
4. New terms (Rooms, rates and inventory): **Overbooking limit** ("Per room type, default 0: how many rooms past rooms left the desk may sell; OTA bookings can go past it and are flagged (decision 0007)"); **Rooms left** (as above).
5. New terms (Reservations & front desk): **Deposit due** ("The amount and time a deposit is due, computed at booking from the plan's deposit rule on the nightly prices plus tax lines; money is recorded against it from brick 10"); **Discount on a stay** ("A % off the plan price on every night, or a rate per night, with a reason; measured per night against the plan price for the `stay.rate_override` limit; an exception in the owner's daily report"); **Reservation number**; **Booking prefix** (Tenancy: "2–4 capital letters per hotel, unique in the group, used in reservation numbers").
6. **Guest** row, notes: "In Stage 1: title, first and last name, phone (E.164), email, nationality; phone or email required; one record across the group, found by name, phone or email; duplicates are merged in Stage 4."
7. **Permissions matrix** notes: "Reading reservations comes with `reservation.manage`, `night_audit.run` or `leakage.view` (read-only for the last two). `reservation.manage` and discounts within the limit work in a PIN session. The rate override / discount limit is measured per night against the plan price."
8. **Exception** list: discount: "a stay sold below its plan price (`stay.discount_applied` with `exception: 'discount'` and `liveProperty: true`)" (scope per Open question 3).
9. **Reports catalogue:** no change.

### Changes needed in walkthroughs (product-manager, same change as the build)
- `front-desk-morning.md`, new step **6a. 10:32 Phone booking**: "*Does:* Ms Sarah Collins calls for 9–12 Dec. Chiamaka opens New reservation, picks the dates and 1 adult, sees Deluxe King '7 · 5 · 3' and Junior Suite 'Sold out 11 Dec', picks Bed & breakfast, finds no match for Collins, adds her (British, phone), and books. *Sees:* ₦617,400.00* for 3 nights, deposit due ₦205,800.00* by 27 Nov, ≈ £316.62 at ₦1,950/£; reservation VI-2611-0483; she copies the confirmation into WhatsApp with Zenith Bank 0123454471 and the reference. *Behind the scenes:* one transaction locks Deluxe King for 9, 10 and 11 Dec, checks the overbooking limit (0), adds one booked room per night, stores the plan price and terms; audit events `guest.created`, `reservation.created`. About 75 seconds."
- `front-desk-morning.md` "What can go wrong": add "Booking for a sold-out night: the type shows 0 and 'Sold out 11 Dec'; if two agents book the last room at once, the second sees 'Deluxe King was just sold for 11 Dec' with what is still free, and nothing is saved." and "Discount above her limit while booking: refused with the limit until approvals (brick 5)." Step 7's "2 left on 25 Nov" wording stays (brick 8).
- `front-desk-morning.md` "Becomes tests": "A phone booking locks and decrements Deluxe King for each night and stores plan price and terms; the last-room race books once; a discount over the limit is refused on the server."
- `guest-stay.md` step 1: a note "Until the booking engine (Stage 4), the same booking is taken by phone at the desk (`front-desk-morning.md` step 6a) and the deposit is paid by transfer against the copied confirmation."
- `night-audit.md`: reservation numbers KVI-2611 and KVI-2618 become VI-2611-0xxx (design format, Open question 5).
- `journeys/README.md` demo world: add "Reservations: about 150 at Kora Victoria Island over the next 30 nights (26 arriving on 25 Nov, Mr Mensah's VI-2611-0482 among them; Junior Suite 1 left on 10 Dec and sold out on 11 Dec; Deluxe King 3 left on 11 Dec) and about 20 at Kora Ikeja GRA; booking prefixes VI, IKJ, ABJ, PH". Add Ms Collins's booking as the one made in review.
- `00-golden-thread.md` hop 1: no change (the Acme booking through #4 needs corporate accounts, brick 12); its open question "start from the seeded reservation or book it through #4" is answered: seeded in brick 4, booked through #4 from brick 12.

### Changes needed in `docs/design/screen-inventory.md` and `docs/design/CHANGES.md` (frontend, with the build)
- Inventory: New reservation (#4) → built (Stage 1 brick 4, one room); Reservation detail (#5) → built read-only (actions with bricks 5–10); Reservations list and search → built; #19 and #33 rows: Guest pays per night built.
- CHANGES:
  - **New reservation:** four steps, **Dates & guests · Room & rate · Guest · Review & book**; the design's **Guarantee & deposit** step folds into Review (the deposit follows the plan's rule; card guarantees and collecting deposits come later) and "& send" goes (Vento sends no messages until Stage 4; **Copy confirmation** instead). "Add another room" waits (Open question 6). The corporate row isn't shown until brick 12. **Change rate** with Discount / Rate per night and reason pills under the summary; over-limit is a message, not the PIN panel, until brick 5. Draft kept for the session only.
  - **Reservation detail:** no tabs (Overview content only; Rate & charges, Guest & registration, Messages and Documents come with their bricks); **Deposit** replaces **Balance** in the summary row; Routing, Messages sent and Company & guarantee cards wait for bricks 10, 12 and Stage 4; actions are **Copy confirmation** and **Audit trail**; "Rack … contract rate saves" line becomes "Plan price … discount" when discounted.
  - **Reservations list:** columns Total and Deposit instead of Balance; views Upcoming / Booked today / All; no bulk bar, Columns or Export.
  - **First-rate table and plan editor:** Guest pays per night column added (was deferred).

## Reports
No new reports. From the fixed catalogue:
- **Arrivals / departures / in-house** (brick 8, 15): read stays and their status.
- **Deposits held** (brick 10, 15): deposits due here vs money received against them.
- **Rate override & discount** (brick 15): `stay.discount_applied` by staff, with plan price, sold price, reason and approver.
- **No-shows & cancellations** (bricks 6, 13, 15): read the stored terms and penalties.
- **Manager's flash** and **owner's daily report** (bricks 15–16): room nights on the books come from stay nights; discounts as exceptions.

## UI copy
- Sidebar and page: "Reservations" · eyebrow "Kora Victoria Island" / "All hotels" · "New reservation" (N)
- Views: "Upcoming" · "Booked today" · "All" · search placeholder "Search name, phone, email or booking no." · pills "Status", "Room type", "How they booked", "Arrival dates", "Deposit due" · columns "Hotel", "Guest", "Booking", "Stay", "Room", "How they booked", "Status", "Deposit", "Total" · "Not assigned" · "₦205,800.00 due 27 Nov" · "1–50 of 152" · "Previous" / "Next"
- Status badges: "Confirmed" (brand) · tag "Foreign national"
- Sheet: "New reservation" · "Draft saved 10:33" · steps "Dates & guests", "Room & rate", "Guest", "Review & book" · phone "Step 2 of 4 · Room & rate" · "Discard draft"
- Dates & guests: "Hotel" ("Which hotel?") · "Arrival" · "Departure" · "Adults" · "Children" · summary "Wed 9 Dec → Sat 12 Dec 2026 · 3 nights · 1 adult" · "Continue" (↵)
- Room & rate: "Left per night" · "Excl. taxes" / "Incl. taxes" · "₦168,000.00 /night" · "avg ₦158,333.33 /night" · "₦617,400.00 total incl. taxes" · "from ₦120,000.00" · "Sold out 11 Dec" · "Sleeps 2 adults and 1 child" · "Min stay 2 nights from Sat 5 Dec" · "Closed to arrival on 2 Dec" · "No rates for Junior Suite on these dates." · "Back" (⌘←) · "Continue to guest"
- Summary: "Summary" · "Room & breakfast" · "Service charge 10%" · "VAT 7.5%" · "Lagos consumption tax 5%" · "Total" · "Deposit due" · "First night incl. taxes, by 27 Nov 2026, 10:32" · "No deposit" · "Paid in full at booking" · "Cancellation" · "Free until Mon 7 Dec 2026, 14:00. After that, or no-show: first night, ₦205,800.00." · "Non-refundable: the full stay is charged if cancelled." · "Rates exclude service charge and taxes." · "≈ £316.62 at ₦1,950/£, CBN, 25 Nov 2026"
- Change rate: "Change rate" · "Discount" (suffix "%") · "Rate per night" · "Reason" pills "Repeat guest", "Corporate rate match", "Long stay", "Service recovery", "Other" · "Note (optional)" · hint "Recorded with your name. This shows in the owner's daily report." · "₦168,000.00 → ₦151,200.00 a night · 10% off Bed & breakfast" · "Remove discount"
- Guest: "Find a guest" (placeholder "Name, phone or email") · "No guest matches “Collins”. Add them below." · "Title" · "First name" · "Last name" · "Phone" (hint "With country code for foreign numbers, e.g. +44 7700 900123") · "Email" · "Nationality" · "How they booked": "Phone", "WhatsApp", "Email", "In person" · "Notes" (placeholder "e.g. Quiet room, late arrival around 22:00") · "Continue to review"
- Review: "Review & book" · "Reason for booking through the min stay" (required) · "Sarah Collins already has VI-2611-0471 for 10–11 Dec." · "Book · ₦617,400.00" (⌘↵)
- Toasts: "Booked VI-2611-0483 for Sarah Collins" · "Confirmation copied" · "Confirmation copied. No transfer account is set for this hotel."
- Detail: "Reservations / VI-2611-0483" · "Booked 25 Nov 2026 by Chiamaka Eze · Phone" · "Stay" · "Room" · "Rate" · "Stay total" ("incl. service charge & taxes") · "Deposit" ("₦205,800.00 due by 27 Nov 2026, 10:32" / "Not required") · "Rate per night" ("Taxes use the rates in force on each night.") · "Plan price ₦168,000.00 · 10% discount, Repeat guest (Chiamaka Eze)" · "Guest" · "Guarantee and deposit" · "Cancelling now is free until 7 Dec 2026, 14:00. After that: first night, ₦205,800.00." · "Activity" · "Copy confirmation" · "Audit trail"
- Activity lines: "Reservation created · Chiamaka Eze · 25 Nov 2026 10:32" · "Discount 10% · ₦168,000.00 → ₦151,200.00 · “Repeat guest”" · "Booked through min stay · “Guest leaving Saturday for a wedding”"
- Confirmation (copied): "Kora Victoria Island: Hello Sarah, your booking is confirmed. Deluxe King, Bed & breakfast, 9–12 Dec 2026 · 3 nights, ₦617,400.00 incl. taxes. Confirmation VI-2611-0483. To guarantee your room, please pay a deposit of ₦205,800.00 by 27 Nov 2026 to Zenith Bank 0123454471 (Kora Hospitality Ltd) with reference VI-2611-0483. Free cancellation until 7 Dec 2026, 14:00. Check-in from 2pm at Plot 1412 Ahmadu Bello Way, Victoria Island." (Non-refundable: "Paid in full at booking: please pay ₦496,125.00 to …"; no deposit: the deposit sentence is left out.)
- Errors: "Deluxe King was just sold for 11 Dec. 2 Executive King rooms are free for these nights." · "Fully booked for 11 Dec. Overbooking limit reached." · "The price changed since you quoted it: Bed & breakfast is now ₦175,000.00 a night. Check the new total with the guest and book again." · "15% is over your 12% discount limit. Use up to 12%, or ask a manager with a higher limit to make this booking." · "To charge more, pick another plan." · "A free night is a comp. Comps come with folios." · "Bed & breakfast's breakfast part is ₦18,000.00 a night, so the rate can't go below it." · "Give a reason for booking through the min stay." · "Enter a phone number or an email, so the hotel can reach the guest." · "9 Dec 2026 is before the business date (10 Dec 2026). Pick a new arrival date." · "Kora Abuja's taxes aren't set up yet. Ask finance to set them up." · "Deluxe King would be 1 room short on 11 Dec (48 booked, 47 rooms). Move or cancel a booking first." · "This booking was already made as VI-2611-0483." · "Couldn't load availability. Nothing was booked." → "Try again"
- Empty: "No reservations at Kora Abuja yet. Bookings taken here, on the phone or at the desk, show in this list." → "New reservation" · "No reservations match these filters." → "Clear filters" · "No rates set for Kora Abuja yet. Ask your GM to set rates."
- Offline: "Needs a connection to check live availability" · "Offline since 17:32. New bookings need a connection to check live availability. Last updated 17:31." · "Checking whether VI-2611-0483 was booked…"
- Permission denied: "Only front desk, revenue managers, GMs and the owner can make reservations. Ask your GM."
- Owner's daily report line (brick 16): "Discount · VI-2611-0483 Sarah Collins · Deluxe King · 10% (₦168,000 → ₦151,200 a night, ₦50,400 over 3 nights) · Chiamaka Eze · Reason: repeat guest"

## Out of scope
- **Approvals** for over-limit discounts (brick 5); **modify, cancel, no-show** and penalties (brick 6); **room assignment**, tape chart, room moves, out-of-order rooms reducing inventory (brick 7; the formula already has the term); **check-in, walk-in, arrivals/departures lists**, ID and registration (brick 8); **taking deposits and payments**, folios (brick 10); **corporate bookings**, the Acme rate on #4, company guarantee and routing (brick 12); **groups, rooming lists and more than one room in the UI** (brick 14, unless Open question 6 changes it); **import** of future reservations (brick 17).
- Sending confirmations or deposit requests by WhatsApp, SMS or email; guest messages and templates; the guest app link (Stage 4).
- Tentative holds with release times, auto-release of unguaranteed bookings, waitlists, day use, card guarantees and pre-authorisation, packages and add-ons, children's ages, extra beds, ETA and arrival time (brick 8), booker separate from guest, travel agents, OTA and booking engine sources (Stage 4).
- Guest profiles beyond the minimum: preferences, VIP, blacklist, stay history page, merge duplicates (Stage 4, #41).
- Editing the overbooking limit (Open question 4); overbooking reports and OTA overbooking alerts (#40, Stage 4).
- Test or training bookings: every booking is real and holds a room; a booking made by mistake is cancelled with brick 6.
- ⌘K entries ("New reservation", "Find reservation", a guest's name): with the command palette brick.

## Decisions (owner, 2026-11-26)
All six recommended defaults taken.
1. **Deposit unpaid:** a desk booking is **Confirmed** at once with the deposit shown as due and its due time (amber on the list and detail; a **Deposit due** filter). Unpaid deposits don't release the room in Stage 1; the agent follows up and cancels with brick 6.
2. **Guest:** a minimal **group-wide guest** (title, name, phone or email, nationality), found by name, phone or email while booking; full profiles and merging in Stage 4.
3. **Discounts in the owner's daily report:** **every** stay sold below its plan price, with name, amount and reason, grouped and counted.
4. **Overbooking:** **0 for every room type, no setting** in Stage 1; the column exists, a GM-editable limit comes with channels (Stage 4).
5. **Reservation numbers:** **`VI-2611-0483`**: a 2–4 letter booking prefix per hotel (seeded VI, IKJ, ABJ, PH; suggested from the name for new hotels, editable on Settings › Hotels by `setup.manage` until the hotel's first booking), year and month booked, and a sequence per hotel per month.
6. **Rooms per booking:** **one room per reservation in this brick's screens**; the server takes a list of stays from day one; "Add another room" arrives with group reservations (brick 14).

Legal checks carried, not new: advertised prices and taxes (rates Open question 20); seeded VAT, Lagos consumption tax and service charge rates to verify against the Nigeria Tax Act 2025 and the Lagos law (taxes Decision 1). Collecting guest phone, email and nationality at booking rests on the contract for the stay under the NDPA 2023; nothing else is collected before check-in.
