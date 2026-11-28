# Rate plans and rates (manual)

- **Status:** approved (owner, 2026-11-26: every pricing decision at its recommended default)
- **Stage:** 1 (brick 2 of the plan in [stage-1-plan.md](stage-1-plan.md)). Depends on brick 1 (room types and rooms), hotels and companies (business date, check-in time, go-live) and brick 1b (hotel switch). Feeds brick 3 (tax lines on rates), brick 4 (the nightly price of a booking), brick 6 (cancellation and no-show penalties), brick 12 (corporate rates), brick 13 (room and breakfast charges at night audit) and brick 17 (rate plan import). Channels, the booking engine and the rest of the rates grid stay in Stage 4.
- **Module:** Reservations & Front Desk (rate plans with seasons and restrictions, per `docs/PRODUCT.md` module 1)
- **Walkthroughs:** `going-live.md` step 4 (changed, see "Changes needed in walkthroughs"); the Home setup checklist (`OnbHome`); read by every later step that prices a stay: `front-desk-morning.md` steps 7–8 and 11, `00-golden-thread.md` hop 1, `guest-stay.md` step 1 (Stage 4).
- **Screens:** Rate plans list and editor (#33, `RatePlanEdit.dc.html`, `RatePlanDark.dc.html`, `RatePlanM.dc.html`, view `plan` of `RoomsRates.dc.html` with its loading, empty, error and offline states), first rate (#19, `OnbRate.dc.html`, used as the empty page of Rate plans), the **Rates** tab of the rates grid (#8, `RatesGrid.dc.html`, pulled forward without Channels, Parity or Rooms left; see Open question 12), the Base rate column on Rooms (#33, `RoomsManage.dc.html`).
- **Decisions:** `0004-money-folios-and-ledger.md`, `0005-statutory-rules-as-data.md`, `0006-business-date-and-night-audit.md`, `0013-designs-as-source-of-truth.md`, `0021-feature-switches.md` (gated by `front_desk`). No new decision record needed unless the owner changes Open question 1 or 12.

## Problem
A hotel can't quote, book or charge a night until Vento knows what each room costs on each date and under what conditions. Today Tunde keeps BAR in a spreadsheet, the B&B and non-refundable prices in his head ("BAR plus breakfast", "10% off if they pay now"), the December prices on a WhatsApp message to the desk, and the cancellation rule on a printed sheet. Every agent quotes slightly differently, nobody can tell afterwards what the "right" price was, so a discount looks like a price and leakage hides in plain sight.

## Persona and job
- **GM** (Tunde Bello, laptop) and **revenue manager** (Sade Bakare, laptop, Kora Victoria Island and Kora Ikeja GRA): set up the hotel's plans once at go-live (about 30 minutes), then change prices for seasons, weekends and events a few times a week, and close or restrict dates when the house fills.
- **Owner** (Mrs Adaeze Okafor): same rights for any hotel; sees in the morning report when tonight's price was cut after go-live.
- **Front desk agent** (Chiamaka Eze, shared PC): reads prices and conditions to quote a guest on the phone ("What's B&B on 5 Dec?"), many times a day. She doesn't change them. From brick 4 she picks a plan while booking and Vento fills the price.

## Success looks like
- Kora Victoria Island's four plans (Best available, Bed & breakfast, Non-refundable, one corporate contract) set up by hand in under 10 minutes; Best available for 4 room types in under 2 minutes and 1 click after typing.
- A season ("Festive season, 18 Dec–2 Jan, all types, min stay 2") entered in under 1 minute and 3 clicks after typing, and every derived plan follows it without a second edit.
- Every nightly price used by a booking comes from one server function with one rounding rule; derived prices are never typed, so Non-refundable can't drift from BAR.
- Zero floats: every price is `numeric(14,2)` with its currency, calculated with the decimal helpers, rounded once.
- After go-live, a cut to tonight's price shows in the next morning's report with the name and reason, without anyone digging.
- Existing bookings never change price when a rate changes (proved by a test once brick 4 lands).

## User flow
Tunde, GM at Kora Victoria Island, business date 13 Nov 2026 (setup week, `going-live.md` step 4). Rooms are set up (brick 1).

1. Home's setup checklist shows **Set rates** ("Prices for each room type, so you can take bookings"). He clicks it and lands on **Rates & channels › Rate plans**, which is empty, so the page is the first-rate table (`OnbRate` layout): "Your first rate. One price per room type. Add plans, seasons and conditions whenever you're ready."
2. The table lists his four room types. He types weekday prices excl. taxes: Standard Queen 120,000, Deluxe King 150,000, Executive King 210,000, Junior Suite 320,000. The **Fri and Sat** column says "same" for each; he leaves it. The tick **Also create a Bed & breakfast plan at +₦18,000** is on.
3. He clicks **Create Best available** (1 click after typing). Toast: "Best available and Bed & breakfast created." The page becomes the plans list: Best available (`BAR`, own prices, room only) and Bed & breakfast (`BB`, Best available + ₦18,000, breakfast included).
4. **New rate plan** → editor (#33). Name "Non-refundable", code suggested `NR` (he types `NRF`). **Price: Derived from a parent plan**, parent Best available, **Percentage** −10. The preview card shows, for the business date, BAR and this plan per room type (₦120,000 → ₦108,000 …). **Cancellation policy: Non-refundable.** **Deposit rule: Full stay, at booking.** **Save plan** (⌘S). About 6 clicks.
5. He opens **Best available** and fills what the first-rate table skipped: cancellation "Free until 48 hours before arrival, then the first night", deposit "First night, within 48 hours of booking". Saves. Bed & breakfast got the same defaults when it was created; he checks it and leaves it.
6. **Rate calendar** tab: 14 nights from the business date, rows grouped by room type, one row per plan. Best available cells are editable; Bed & breakfast and Non-refundable cells are muted with a link icon ("derived plan, edit its parent").
7. He clicks **Change dates** (side sheet, the design's Bulk edit): plan Best available, room types All, dates 18 Dec 2026–2 Jan 2027, days all, season name "Festive season", prices per room type (140,000 / 175,000 / 240,000 / 360,000), min stay 2. The sheet says "16 dates change for 4 room types. Bed & breakfast and Non-refundable follow automatically." He clicks **Apply to 16 dates** (3 clicks after typing). Toast "Prices changed for 16 dates · Undo".
8. For Saturday 5 Dec he clicks the Deluxe King cell, types 165,000 and presses Enter (2 clicks). Toast "Deluxe King on 5 Dec set to ₦165,000 · Undo".
9. Back on **Rooms**, the **Base rate** column now shows each type's Best available weekday price.

Chiamaka (front desk, read-only) opens **Rate calendar** from ⌘K ("Rates for 5 Dec"), reads "Deluxe King · Bed & breakfast · ₦183,000 excl. taxes and service charge · min stay 2" and quotes the caller.

Corporate contracts (Acme's ₦180,000 Executive King) are created the same way with **Who can book it: Corporate accounts only**; linking them to Acme comes with brick 12.

## Acceptance criteria

### Main path
**Rate plans** (per hotel)
- Fields:
  - **Name** (required, up to 60 characters, unique among the hotel's active plans) and **code** (required, 2–10 capital letters, digits or hyphens, suggested from the name, unique in the hotel including archived plans; used by imports, reports and later channel mapping).
  - **Price**: **Own prices** or **Derived from a parent plan**.
    - Own prices: a **standard price** per room type the plan covers, with a **weekday** price (Sun–Thu nights) and an optional **Fri and Sat** price (blank = same as weekday). Required for every covered room type.
    - Derived: a **parent** plan with own prices (one level only: a derived plan can't be a parent) and an adjustment of either a **percentage** (−90% to +100%, up to 2 decimals) or an **amount per night** (± whole naira). One or the other, never both.
  - **Room types**: which of the hotel's active room types it sells. Default all. A derived plan can only cover room types its parent covers.
  - **Meal plan**: Room only, Breakfast included, Half board, Full board (`room_only`, `bed_breakfast`, `half_board`, `full_board`). For any meal plan other than Room only, a **meal allocation** (₦ per room per night, the part of the price that is food revenue; see Behind the scenes). For a derived plan with an amount offset and breakfast, the allocation defaults to the offset.
  - **Cancellation policy**: either "Free until N hours before arrival, then {first night · N% of the stay · the full stay}" (N from 0 to 720; counted back from the hotel's check-in time on the arrival day), or **Non-refundable** (the full stay is charged on cancellation). The no-show penalty is the same as the late-cancellation penalty.
  - **Deposit rule**: None · First night · N% of the stay · Full stay; due **at booking** or **within N hours of booking** (or by arrival, if sooner).
  - **Min stay**: nights, 1–30, default 1; applies to every date (date-level min stay from the calendar can raise it, never lower it).
  - **Extra adult**: ₦ per night for each adult above the room type's base occupancy (own-price plans only; blank = no charge). Derived plans charge their parent's amount, unadjusted. Children are free up to the room type's max children.
  - **Who can book it**: **Anyone** or **Corporate accounts only**.
  - Under **More options**: **Prices include taxes and service charge** (off by default in this brick; **on by default since brick 8b**, decision 0032; see Tax lines).
- Plans are listed in a sort order (drag, or move up/down with the keyboard), which booking pickers follow from brick 4.
- **Duplicate** copies everything except name and code ("Best available copy", code blank), and copies standard prices but not date prices.
- **Archive** hides the plan from pickers and the calendar; it stays on old records and under the **Archived** filter with **Restore**. A plan that other active plans derive from can't be archived: "Bed & breakfast and Non-refundable follow Best available. Archive them first, or point them to another plan." A plan never used on a booking can be **Deleted for good** from Archived (server refuses once it has history, from brick 4).
- Switching a plan from own prices to derived is refused while other plans derive from it; otherwise it drops its own date prices from the business date on, after a confirm with the count. Switching from derived to own prices pre-fills standard prices with today's derived prices.
- Removing a room type from a parent plan removes it from the plans that derive from it, after a confirm naming them.

**Rates**
- For any night, a plan with own prices costs: its **date price** for that room type and date if one is set, otherwise its **standard price** (Fri and Sat price on Friday and Saturday nights when set, else the weekday price). A **night** is the stay date (the 5 Dec night runs from 5 to 6 Dec).
- A derived plan's price is computed, never stored: parent price × (1 + %) or parent price + amount, kept as a `Decimal` and rounded once, half-up, to the whole naira (Open question 2). Derived plans also follow the parent's date-level restrictions ("including closures", as in the design).
- **Date prices** are set from the **Rate calendar**: inline on one cell, or with **Change dates** for a range (plan with own prices, room types, from–to dates, days of the week, a price per room type or **Back to standard price**, optional **season name**, and restrictions). Up to 366 dates per apply, all in one transaction. A season name is a label on the dates (shown as a band over the calendar), not a separate record; the last apply wins per date.
- Prices are whole naira above ₦0 and up to ₦100,000,000 (Open question 2). ₦0 is refused: a free night is a comp on the stay, which has its own permission and exception.
- Any save that would make a derived plan ₦0 or less on any date from the business date on is refused, naming the plan, room type and first date.
- Dates before the business date are read-only. Dates can be set up to 2 years after the business date.
- All amounts are NGN (`currency = 'NGN'` stored beside every amount).

**Restrictions** (only what brick 4 needs; Open question 11)
- Per plan with own prices × room type × date: **Closed** (no new bookings for nights on that date), **Closed to arrival** (no arrivals on that date), **Min stay** (nights, applied on the arrival date). Set with **Change dates** (Keep as they are · On · Off for each) or the cell menu. Derived plans follow their parent; a plan's own min stay is a floor (the effective min stay is the larger of the two).
- Max stay and closed to departure arrive with channels (Stage 4).

**Rate calendar** (the Rates tab of #8)
- Opens at the business date, 14 nights per page (arrows, a date picker, and a 30-night option). Rows grouped by room type in sort order, one row per active plan that covers it; base cells editable for members with `rates.edit`; derived cells muted with the link icon; tags `MIN 2`, `CTA`, `Closed`; Friday and Saturday columns shaded; season name as a band above the dates it covers. Filters: room type, and **Corporate plans** (hidden by default).
- Header: "Rate calendar · Kora Victoria Island · ₦ per night excl. taxes and service charge · 25 Nov – 8 Dec 2026".
- Below `md`: one room type at a time (picker at the top), a list of dates with each plan's price and tags; **Change dates** opens as a bottom sheet.
- Rooms left per date and the Channels and Parity tabs are not in this brick (brick 4 and Stage 4).

**Rooms page and Home**
- Rooms shows the **Base rate** column: the weekday standard price of the first plan in sort order that has own prices and is open to anyone. A room type not covered by it shows "Not priced" (amber) linking to that plan.
- Home's setup checklist gains **Set rates**, done when the hotel has an active plan with own prices covering every active room type.
- ⌘K: "Rate plans", "New rate plan", "Rate calendar", "Rates for 5 Dec" (opens the calendar at that date), and each plan by name.

**What brick 4 reads (the seam)**
- One server function, `quoteStay`, in the rates service: input hotel, plan, room type, arrival, departure, adults, children (and, from brick 12, a corporate account). Output: one line per night (date, price, currency, whether it came from a date price or the standard price, extra adult charge, meal allocation), the total before taxes, the plan's terms as they stand (meal plan, cancellation policy, deposit rule, prices include taxes), the plan's version, and any restriction it breaks (closed, closed to arrival, min stay) with the date and a message.
- The pure calculation (standard vs date price, derivation, rounding, extra adult) lives in `@vento/shared` so the editor preview and the server agree; the server is the authority and re-computes on every booking.
- `listBookablePlans` for a hotel, room type and dates: active plans covering that type, open to anyone (corporate-only plans only with a linked corporate account, from brick 12).
- Brick 4 stores on each stay the nightly prices and the terms it was sold at (a snapshot). Later rate changes never alter it; night audit (brick 13) posts the stored nightly price. The stored price is the **plan price**: the reference for "Rate override / discount on a stay" limits and for the "rate below plan" exception.
- The deposit amount (brick 4/10) is the rule applied to the nightly prices plus their tax lines from brick 3.

### Organization isolation
- Rate plans, standard prices, date prices and restrictions carry `organizationId` and `propertyId`. Every read and write filters by the organization from the auth context; an id from another group answers "not found".

### Property scoping
- Rate plans and rates belong to one hotel; nothing is shared across the group (room types are per hotel). A parent plan must be in the same hotel.
- Sade (revenue manager, Kora Victoria Island and Kora Ikeja GRA) sees and edits only those two hotels; a request naming Kora Abuja's plan is refused as not found.
- Hotel switch (`docs/UX-STANDARD.md` §8): Rate plans and Rate calendar are **hotel pages**. With All hotels: "Rates are set per hotel. Pick a hotel." with the hotel list. Links carry `?hotel=`.

### Permissions, limits and approvals
- **Edit rates and restrictions** (`rates.edit`, existing row): revenue manager ✓, general manager ✓, owner / group admin ✓. Covers creating, changing, duplicating, archiving, restoring and deleting plans, standard prices, date prices and restrictions.
- **Reading** plans and the calendar: anyone with `rates.edit`, `rooms.setup` or **Create / modify reservation** (`reservation.manage`), read-only for the last two (front desk quotes by phone). No new permission row; the rule goes into the matrix notes in `docs/DOMAIN.md`.
- The **Rates & channels** sidebar entry shows when a member has any of `rooms.setup`, `rates.edit`, `reservation.manage` (today `needs: ['rooms.setup']`); inside it, **Rooms**, **Rate plans** and **Rate calendar** tabs show per permission. `/rates` opens the first tab the member can see.
- No limits and no approvals on editing rates. After go-live, a change that **lowers tonight's price** (any plan, any room type, for the current business date) asks for a **reason** in the same dialog ("Recorded with your name.") and raises an exception (below). Before go-live no reason is asked.
- Rate override and discount limits (`stay.rate_override`: front desk ≤ 10%, revenue manager ≤ 25%, GM ≤ 50%, owner any) are not used in this brick; brick 4 measures them against the plan price defined above, and brick 5 adds the approval prompt.
- Gated by the `front_desk` feature switch (decision 0021). A member without the permission who opens a link sees: "Only a revenue manager, GM or the owner can change rates. Ask your GM."

### Audit events
All in the same transaction as the change, with actor, device, property, business date, before/after and reason where given:
- `rate_plan.created`, `rate_plan.changed` (fields, adjustment, terms, room types, who can book), `rate_plan.archived`, `rate_plan.restored`, `rate_plan.deleted`, `rate_plans.reordered`
- `rate_plan.prices_changed` (standard prices: room type, weekday and Fri–Sat, before → after)
- `rates.dates_changed` (one per inline edit or **Change dates** apply: plan, room types, date range, days, season name, before and after per room type and date for prices and restrictions, batch id). **Undo** writes another `rates.dates_changed` with `undoOf` set and the previous values restored.
- Flags in `after`: `liveProperty`, and `exception: 'rate_lowered_tonight'` when the change lowers any price for the current business date after go-live.
- The plan editor's **Change history** card shows the last 3 events on the plan with a link to the audit log filtered to it.

### Leakage exceptions
- **New exception "Rate lowered for tonight"**, only after go-live: a plan's price for the current business date lowered (standard price, date price, adjustment, or a parent change that lowers a derived plan). Lowering tonight's price and raising it again after one booking is the simplest way to sell a room cheaply without a discount ever showing. Owner's daily report line: "Rate lowered for tonight · Deluxe King · Best available ₦150,000 → ₦120,000 (and 2 plans that follow it) · Tunde Bello · 21:40 · Reason: slow night, match Eko Hotel". Raising a price, changing future dates, terms or names raises nothing.
- Brick 16 turns events with both flags into exception rows; this brick only writes them.
- This brick prepares the reference for the existing **rate below plan** and **override / discount** exceptions (brick 4/5): the stored plan price per night.

### Offline behaviour
- Changing plans and rates needs a connection. Offline, both pages show the cached data with the design banner, worded for this brick: "Offline since 17:32. Rate plans and rates are read-only offline." Edit buttons are disabled with "Needs a connection". Nothing is queued.
- The plans and the next 60 nights of prices are cached on the device for reading. (New bookings offline stay disabled, per `front-desk-morning.md`; the design's "new bookings use the rates saved on this computer" is dropped and logged in `docs/design/CHANGES.md` by the frontend.)

### Business date
- The calendar starts at the business date; earlier dates are read-only ("25 Nov 2026 is before the business date. Past rates can't change.").
- Changes apply at once to new quotes for any date from the business date on. The Rooms subtitle "changes apply from the next business date" is already dropped for rooms (brick 1) and doesn't apply to rates either.
- "Tonight" in the exception means the property's current business date, even after midnight before night audit has run.
- Audit events record the business date. Go-live = the property's first completed night audit (`live_since`).

### Tax lines
- No tax lines are computed or posted in this brick. Prices are **exclusive** of VAT, consumption tax and service charge by default, and every place a price shows says so ("excl. taxes and service charge"). *Superseded by [decision 0032](../decisions/0032-prices-include-taxes-by-default.md) ([spec](stage-1-tax-inclusive-default.md)): new plans are **inclusive** by default, every price says "incl." or "excl." as its plan does, and the demo's plans are all-in.*
- A plan with **Prices include taxes and service charge** stores the gross; brick 3 backs the taxes out at posting with the decimal library and keeps any rounding difference on one explicit line (per the nigeria-compliance skill). The calendar labels such a plan's row "incl. taxes".
- The room part of a price is tax category `accommodation`; the meal allocation is `food`. Rate plans don't carry their own tax category picker: no v1 plan needs anything else. Brick 3 owns the categories and the rules (VAT, Lagos consumption tax, service charge are seed values to verify against current law).
- The **Guest pays per night** column of the first-rate table (`OnbRate`) and the editor preview appear with brick 3; until then they aren't shown (logged in `docs/design/CHANGES.md`).

### Foreign currency
- Rates are NGN only; the currency column is stored so a USD-priced plan can be added later without migrating data (Open question 15).
- The seam for brick 3: a display helper turns an NGN amount into a foreign equivalent with the FX rate, source and date (`≈ $105.26 at ₦1,425/$, CBN, 25 Nov 2026`), never stored on rates. Brick 4 uses it in quotes for foreign guests; the calendar and editor show NGN only.

### Availability locking
Not relevant: prices and restrictions don't change the number of sellable rooms, so no inventory row is locked. `Closed` stops a plan selling; it doesn't remove rooms. Brick 4 checks restrictions inside its booking transaction by calling `quoteStay` there, so a closure applied a moment earlier is respected. No ARI change rows are written; Stage 4 does a full resync when plans are first mapped.

### Empty, error and edge cases
- **No rooms yet:** "Set up rooms first. Rates are set per room type." → **Set up rooms** (or, without `rooms.setup`, "Ask your GM to set up rooms.").
- **Rooms but no plans:** the first-rate table (step 1). Read-only members see "No rate plans yet. A rate plan sets the price and conditions for a room type." with no button.
- **Filtered empty (calendar, archived):** "No rate plans match these filters." → **Clear filters**.
- **Load error:** "Couldn't load rate plans. Nothing changed. Bookings keep their rates." → **Try again**.
- **New room type added after plans exist:** it is on no plan; Rooms shows "Not priced", the plans list shows "Executive Suite isn't priced on any plan" with **Add to Best available**.
- **Room type archived:** hidden from the editor and calendar; its prices are kept and come back if it is restored.
- **Name or code taken:** "Non-refundable already exists at this hotel." / "Code NRF is used by Non-refundable." / archived: "Code NRF belongs to an archived plan. Restore it, or pick another code."
- **Derived would hit ₦0:** "Non-refundable would be ₦0 or less for Standard Queen on 12 Jan 2027. Use a smaller offset."
- **Both % and amount typed:** the second field clears the first; the save sends one.
- **Range edit with nothing to change:** **Apply** stays disabled with "Choose a price or a restriction to change".
- **Days of the week leave no dates** (Fri only, 7–10 Dec): "No Fridays between 7 and 10 Dec."
- **Two people editing one plan:** each save sends the version it started from; the second gets "Sade changed Best available at 14:02. Reload to see the change, then save again." Date price edits are last-write-wins per cell, both audited.
- **Business date rolls while the calendar is open:** the first column moves on the next refresh; an edit to a date now in the past is refused with the past-date message.
- **Undo after someone else changed the same dates:** undo restores only cells still holding the values it set, and says "2 dates were changed by Sade since, so they were left as they are."
- **Corporate-only plan before brick 12:** listed, priced and shown in the calendar under **Corporate plans**, but not offered on new bookings until it is linked to a corporate account.
- **Long names** truncate with a tooltip; 20 plans × 4 room types × 30 nights render without horizontal page scroll (the grid scrolls in its own container with a sticky first column).

## Behind the scenes
- **Folio postings:** none in this brick.
- **Night audit (brick 13):** posts each in-house stay's stored nightly price as a room charge on that business date, split into the **room** part (department `rooms`, tax category `accommodation`) and, for meal plans, the **meal allocation** (department `food`, tax category `food`), each with its own tax lines from brick 3. The split is what answers "how is breakfast split between rooms and food" (⚑ in the stage plan); see Open question 4.
- **Ledger:** none until Stage 5; the split above makes room and food revenue right from the first audit.
- **Jobs:** none. (ARI pushes after rate changes are Stage 4.)
- **Notifications:** none in app. The exception reaches the owner's daily report (brick 16).
- **Data import at go-live:** rate plans come in with the brick 17 import (`data-import` skill: code, name, room types, meal plan, standard price per room type from a date, cancellation policy, deposit rule) through the same service and validations; seasons and date prices are set in the calendar afterwards. Imported future reservations carry the rate they were sold at and never read today's price. This answers `going-live.md`'s open question about a rate plan import (Open question 17). Until brick 17, plans are created by hand, which takes under 10 minutes.

### Demo seed
Kora Victoria Island (prices excl. taxes and service charge, illustrative):

| Plan | Code | Price | Meal plan | Cancellation | Deposit | Who can book |
|---|---|---|---|---|---|---|
| Best available | `BAR` | Own: Standard Queen ₦120,000 · Deluxe King ₦150,000 · Executive King ₦210,000 · Junior Suite ₦320,000, same on Fri and Sat | Room only | Free until 48 h before arrival, then the first night | First night, within 48 h | Anyone |
| Bed & breakfast | `BB` | Best available + ₦18,000 per night (Open question 3) | Breakfast included, allocation ₦18,000 | As BAR | As BAR | Anyone |
| Non-refundable | `NRF` | Best available − 10% | Room only | Non-refundable | Full stay, at booking | Anyone |
| Acme Energy | `ACME` | Own: Executive King ₦180,000 | Room only | Free until 24 h before arrival, then the first night | None | Corporate accounts only |
| Acme Energy B&B | `ACME-BB` | Own: Deluxe King ₦130,000 | Breakfast included, allocation ₦18,000 | As Acme Energy | None | Corporate accounts only |

- Dates: **Festive season** 18 Dec 2026–2 Jan 2027 on Best available (₦140,000 / ₦175,000 / ₦240,000 / ₦360,000, min stay 2); Sat 5 Dec: Deluxe King ₦165,000 and min stay 2 on all types; Wed 2 Dec: Executive King closed to arrival (as in `RatesGrid`).
- No Fri and Sat uplift on Best available: Mr Mensah's 27 Nov and Ms Collins's 11 Dec nights are Fridays, and the walkthrough totals assume flat prices.
- No extra adult charge seeded.
- The other three hotels get Best available, Bed & breakfast and Non-refundable with the same terms and illustrative prices: Ikeja GRA ₦95,000 / ₦120,000 / ₦165,000 / ₦250,000, Abuja ₦110,000 / ₦140,000 / ₦195,000 / ₦300,000, Port Harcourt ₦100,000 / ₦130,000 / ₦180,000 / ₦280,000.
- Brick 12 links `ACME` and `ACME-BB` to Acme Energy Ltd.

### Changes needed in `docs/DOMAIN.md`
1. **Rate plan** row: "Per hotel. Name (unique among active plans) and code (unique in the hotel, archived included). **Own prices** (standard price per room type, weekday and Fri–Sat, plus date prices) or **derived** from a parent plan with own prices (± % or ± ₦ per night, rounded half-up to the whole naira, one level only; follows the parent's date prices and restrictions). Room types, meal plan with meal allocation, cancellation policy, deposit rule, min stay, extra adult per night, who can book it (anyone or corporate accounts only), prices inclusive of taxes and service charge unless marked exclusive (decision 0032). NGN. Archived, not deleted, once used."
2. **Rate** row: "The price for a rate plan × room type × night: the date price if set, else the standard price. Derived plans are computed, never stored. A booked stay keeps the nightly prices it was sold at (the **plan price**), which is the reference for discount limits and 'rate below plan'."
3. New terms (Rooms, rates and inventory): **Standard price** ("A plan's everyday price per room type: weekday, and optionally Friday and Saturday nights"), **Date price** ("A price for specific dates, set from the rate calendar; may carry a season name"), **Season** ("A label on a range of date prices, e.g. Festive season; not a separate record"), **Meal allocation** ("The part of a meal plan's nightly price that is food revenue, ₦ per room per night; posted to `food` at night audit"), **Weekend** ("Friday and Saturday nights").
4. **Restriction** row: "In Stage 1: `closed`, `closed_to_arrival`, `min_stay` (on the arrival date) per plan with own prices × room type × date; derived plans follow their parent; a plan-level min stay is a floor. `max_stay` and `closed_to_departure` arrive with channels (Stage 4)." Plus the front-desk rule chosen in Open question 11.
5. **Cancellation policy** row: add "Counted back from the hotel's check-in time on the arrival day. Non-refundable = the full stay. The no-show penalty is the late-cancellation penalty. Stored on the reservation as accepted."
6. New term **Deposit rule** (Reservations): "Per rate plan: none, first night, % of the stay or full stay, due at booking or within N hours of booking (or by arrival if sooner). The amount includes the tax lines on those nights."
7. **Permissions matrix** notes: "Reading rate plans and the rate calendar comes with `rates.edit`, `rooms.setup` or `reservation.manage` (read-only for the last two)." The "Edit rates and restrictions" row is unchanged.
8. **Exception** list: add "rate lowered for tonight (a plan's price for the current business date lowered after go-live; its audit events carry `exception: 'rate_lowered_tonight'` and `liveProperty: true`)".

### Changes needed in walkthroughs (product-manager, same change as the build)
- `going-live.md` step 4: "**Set rates** on the checklist opens the first-rate table: Tunde types the four weekday prices (₦120,000 / ₦150,000 / ₦210,000 / ₦320,000), leaves Fri and Sat as 'same', keeps 'Also create a Bed & breakfast plan at +₦18,000' and clicks **Create Best available**. He adds Non-refundable (Best available − 10%, non-refundable, full stay at booking), fills Best available's cancellation and deposit, and enters the Festive season in the Rate calendar. Acme's two contract plans are created as Corporate accounts only. *Sees:* derived plans marked with a link icon; changing Best available moves Bed & breakfast and Non-refundable. *Behind the scenes:* audit events `rate_plan.created` and `rates.dates_changed`; nothing reaches the owner's report before go-live."
- `journeys/README.md` demo world: rate plans line becomes "Best available (`BAR`, room only), Bed & breakfast (`BB`, BAR + ₦18,000), Non-refundable (`NRF`, BAR − 10%), Acme Energy (`ACME`) and Acme Energy B&B (`ACME-BB`), corporate only"; add the Festive season and 5 Dec dates; replace "Deluxe King Bed & Breakfast ₦165,000" with ₦168,000 if Open question 3 follows the design.
- `guest-stay.md`, if Open question 3 follows the design: Deluxe King B&B ₦168,000; per night ₦168,000 + service charge ₦16,800 + VAT ₦12,600 + consumption tax ₦8,400 = ₦205,800* (illustrative rates); deposit ₦205,800.00; 3 nights ₦617,400.00, balance ₦411,600.00; later amounts that build on these change accordingly. Cancellation stays 48 hours.
- `front-desk-morning.md` open question "Acme's Executive King rate … breakfast?": settled, room only (`ACME`), breakfast on the guest folio. "How is breakfast split" points to the meal allocation.
- Home checklist (`OnbHome`): **Set rates** step text.

### Changes needed in `docs/design/screen-inventory.md` and `docs/design/CHANGES.md` (frontend, with the build)
- #8 row: "Rates tab built in Stage 1 brick 2 without Rooms left (brick 4), Channels and Parity (Stage 4)".
- CHANGES: "Where it sells" pills on #33 replaced by **Who can book it** until Stage 4; Guest pays column deferred to brick 3; offline copy; "Best available" named with code `BAR`; the plan editor's "Min stay: 1 night · 2 on Saturdays" becomes plan min stay plus date min stay from the calendar.

## UI copy
- Tabs: "Rooms" · "Rate plans" · "Rate calendar"
- Page: "Rate plans" · "Kora Victoria Island · 5 plans · ₦ per night excl. taxes and service charge"
- First rate: "Your first rate" · "One price per room type. Add plans, seasons and conditions whenever you're ready." · columns "Room type", "Rooms", "Weekday price, excl. taxes", "Fri and Sat" (placeholder "same") · "Also create a Bed & breakfast plan at +₦18,000" · button "Create Best available"
- Editor: "Rate plan · Bed & breakfast" · "Kora Victoria Island · derived from Best available" · sections "Price", "What's included and rules", "Room types", "Who can book it", "More options" · segmented "Derived from a parent plan" / "Own prices" · "Parent plan", "Offset" (suffix "per night"), "Or percentage" (placeholder "e.g. −10%") · hint "When Best available changes, this plan follows automatically, including closures." · "Meal allocation" (hint "The part of the price that is food revenue, per room per night") · "Extra adult, per night" (hint "For each adult above the room's base occupancy") · "Anyone" / "Corporate accounts only" (hint "Offered only to linked corporate accounts") · "Prices include taxes and service charge" · preview "Preview · Wed 25 Nov" / "₦ per night excl. taxes" · "Change history" / "Audit log"
- Cancellation options: "Free until 48 hours before arrival, then the first night" · "Non-refundable" · Deposit options: "No deposit" · "First night, within 48 hours" · "Full stay, at booking"
- Buttons: "New rate plan", "Save plan", "Duplicate", "Archive plan", "Restore", "Delete for good", "Change dates", "Apply to 16 dates", "Back to standard price", "Add to Best available", "Clear filters", "Try again"
- Calendar: "Rate calendar · Kora Victoria Island · ₦ per night excl. taxes and service charge · 25 Nov – 8 Dec 2026" · legend "derived plan, edit its parent · MIN = minimum stay · CTA = closed to arrival" · cell "Closed" / "Follows Best available"
- Change dates sheet: "Change dates · Best available" · "Dates", "Days", "Season name (optional)", "Min stay", "Closed to arrival", "Closed" (each "Keep as they are" / "On" / "Off") · summary "16 dates change for 4 room types. Bed & breakfast and Non-refundable follow automatically." · disabled hint "Choose a price or a restriction to change"
- Toasts: "Best available and Bed & breakfast created" · "Non-refundable saved" · "Prices changed for 16 dates · Undo" · "Deluxe King on 5 Dec set to ₦165,000 · Undo" · "Bed & breakfast archived · Undo"
- Reason (after go-live, tonight lowered): "Reason for lowering tonight's price" (required) · "Recorded with your name. This shows in the owner's daily report."
- Confirms: "Archive Bed & breakfast? It stops being offered for new bookings. Bookings already made keep their price and terms." → "Archive plan" · "Switch Best available copy to derived prices? Its 12 date prices from 25 Nov 2026 are removed." → "Switch to derived" · "Remove Deluxe King from Best available? It also stops on Bed & breakfast and Non-refundable." → "Remove Deluxe King"
- Errors: "Non-refundable already exists at this hotel." · "Code NRF is used by Non-refundable." · "Enter a price above ₦0. For a free night, comp it on the stay." · "Non-refundable would be ₦0 or less for Standard Queen on 12 Jan 2027. Use a smaller offset." · "25 Nov 2026 is before the business date. Past rates can't change." · "Rates can be set up to 25 Nov 2028." · "Bed & breakfast and Non-refundable follow Best available. Archive them first, or point them to another plan." · "Sade changed Best available at 14:02. Reload to see the change, then save again." · "Needs a connection"
- Empty: "No rate plans yet. A rate plan sets the price and conditions for a room type." · "Set up rooms first. Rates are set per room type." · "Executive Suite isn't priced on any plan."
- Offline: "Offline since 17:32. Rate plans and rates are read-only offline."
- Permission denied: "Only a revenue manager, GM or the owner can change rates. Ask your GM."
- All hotels selected: "Rates are set per hotel. Pick a hotel."
- Owner's daily report line: "Rate lowered for tonight · Deluxe King · Best available ₦150,000 → ₦120,000 (and 2 plans that follow it) · Tunde Bello · 21:40 · Reason: …"

## Decisions after approval (lead, 2026-11-26)
Questions raised while building the server half, settled consistently with the owner's choices:
1. **Shared devices:** `rates.edit` is refused in a PIN session on a shared device, like `rooms.setup`; rates change on a manager's own sign-in. Reading rates by PIN (front desk, `reservation.manage`) still works.
2. **Meal allocation is never more than the price it is part of:** a save is refused when any standard price, date price or derived price of a meal plan, from the business date to 2 years ahead, would be below its allocation: "Acme Energy B&B's meal allocation (₦18,000) would be more than its price for Deluxe King on 12 Jan 2027. Lower the allocation or raise the price." (`MEAL_ALLOCATION_ABOVE_PRICE`). It applies to the plan's own saves and to changes on its parent.
3. **Undo of a dates change** works until night audit moves the business date past the date the change was made on; after that: "This change can't be undone any more: night audit has run since. Change the dates again instead." (`UNDO_EXPIRED`).
4. **Corporate-only plans** stay as specified: listed, priced and shown under Corporate plans, never returned by `listBookablePlans` until brick 12 links them to a corporate account. `quoteStay` returns the plan's `bookableBy`, and brick 4 must refuse a corporate-only plan for a booking without a linked account.
5. **Restoring an archived room type** puts it back on every plan that sold it (its rows and standard prices are kept while archived) and also on active plans derived from a parent that sells it, including plans created while it was archived; each such plan gets a `rate_plan.changed` event with `followsRestoreOf`. Every plan the type comes back on gets a new version, so an editor opened while the type was archived is told someone else saved first instead of dropping the type on save. Rates writes and room type restores at one hotel queue behind one lock, so they never deadlock.

### Code review fixes (lead, 2026-11-26)
6. **"Rate lowered for tonight" has no back door.** After go-live a price counts as lowered when it costs less tonight than before the save; when a plan × room type removed earlier the same business date comes back cheaper than it was then (removals record tonight's prices as `tonightRemoved` on their audit event, including plan and room type archives); and when a new or restored plan open to anyone costs less tonight than the base plan for the same room type (so creating Non-refundable after go-live asks for a reason). Each lowered price says what it was compared with (`against`: `this_save`, `earlier_today`, `base_plan`). One save puts the exception on one event only: `rate_plan.prices_changed` when standard prices moved, else the other event.
7. **Nothing dated disappears unconfirmed.** Removing a room type from a plan, or switching it to derived prices, answers `DATE_CELLS_REMOVED` with what would go from the business date on ("Its 16 date prices and 3 closures are removed. Confirm to save.", `data.count`, `prices`, `closures`, `minStays`, `seasons`); the save goes through when sent again with `confirmDateCellsRemoved` equal to `data.count`. The audit event's `before` keeps every deleted cell (`dateCellsRemoved`) and, on a switch to derived, the old standard prices (`standardPrices`). A switch to own prices drops archived room types from the plan (they have no price).
8. **Batches** of Change dates and Undo are rows in `rate_date_batches` (migration 0014): replay, Undo, "already undone" and the night-audit expiry read them, not the audit log. A batch id reused on another plan is `BATCH_REUSED`.
9. **The brick 4 seam:** `quoteStay` and `listBookablePlans` take the hotel's rates lock in shared mode, so inside a booking transaction prices can't change until it commits; refuse an arrival before the business date (`PAST_DATE`), a stay past the 2-year horizon (`TOO_FAR_AHEAD`) and stays over 365 nights (`STAY_TOO_LONG`); and return `quoteHash`, a hash of everything priced. The plan's version doesn't move when date prices or the parent change, so brick 4 compares `quoteHash` between what the guest was shown and what it books.
10. **First-rate table with every plan archived** answers `PLANS_ARCHIVED` so the page can show the Archived list.

## Out of scope
- Channels, "Where it sells", mapping, ARI, parity, rooms left on the calendar, max stay and closed to departure (Stage 4; rooms left with brick 4).
- Tax rules and the Guest pays column (brick 3), FX rates and USD prices (brick 3; USD-priced plans after v1 unless Open question 15 changes).
- Linking corporate plans to accounts, contract validity dates and per-company negotiated rates (brick 12).
- Booking, quoting a stay to a guest, discounts and overrides (brick 4), approvals (brick 5), applying penalties (brick 6).
- Packages with extras (spa, airport pickup), long-stay or length-of-stay pricing, occupancy-based pricing beyond the extra adult charge, child age bands, extra beds and cots, day-use prices, promo codes (Stage 4), yield rules or automatic pricing.
- Group-wide plans or copying plans between hotels; rate plan import (brick 17); calendar export (no new reports).

## Open questions
Pricing decisions for the owner, each with the recommended default. Nothing is built until these are answered.

1. **How derived plans are set:** either a percentage or a fixed ₦ amount per night (one per plan), one level deep (a derived plan can't be a parent). *Default: both kinds, one level, as in the design.*
2. **Rounding and price entry:** round derived prices to the whole naira (half-up), not to the nearest ₦500 or ₦1,000; enter prices in whole naira (no kobo). *Default: whole naira, matching the design's ₦155,250.* Rounding to ₦500/₦1,000 can be a per-plan option later if pilots ask.
3. **Bed & breakfast price:** the designs use Best available + ₦18,000 (Deluxe King ₦168,000); the walkthroughs use ₦165,000 (+₦15,000). *Default: follow the design (decision 0013) and update `guest-stay.md` and the demo world as listed above.*
4. **Breakfast split (⚑ in the stage plan):** a fixed meal allocation per room per night on the plan, posted to `food` at night audit, the rest to `rooms`. *Default: per room per night, defaulting to the B&B offset (₦18,000).* Per-guest allocation (2 guests = 2 breakfasts) is more accurate but needs a price per guest too; not in v1 unless the owner wants it.
5. **Tax-inclusive or exclusive prices:** what staff see and type. *Default: exclusive everywhere, labelled "excl. taxes and service charge", with an "inclusive" option per plan under More options and none seeded.* **Answered (owner, 28 Nov 2026):** inclusive by default, exclusive per plan; see [decision 0032](../decisions/0032-prices-include-taxes-by-default.md). Finance to confirm (brick 3) whether service charge and taxes apply to the meal allocation the same way.
6. **Weekend:** which nights get the Fri and Sat price. *Default: Friday and Saturday nights, fixed, not a setting.* Other patterns (e.g. Sunday lower) are set with **Change dates** and days of the week.
7. **Children and extra adults:** *Default: children free up to the room type's max children; one optional "extra adult per night" amount per plan with own prices, for each adult above base occupancy; derived plans charge the parent's amount unadjusted; none seeded.*
8. **Corporate rates now or in brick 12:** *Default: brick 2 builds "Corporate accounts only" plans with their own prices (one plan per contract and meal plan, so Acme is `ACME` and `ACME-BB`); brick 12 links them to accounts and adds contract dates. Until then they are listed but not offered on bookings.*
9. **Deposit rule defaults:** *Default: Best available and Bed & breakfast, first night within 48 hours of booking; Non-refundable, full stay at booking; corporate, none (the company guarantees). The deposit amount includes the tax lines on those nights.*
10. **Cancellation defaults:** *Default: Best available and Bed & breakfast free until 48 hours before the 14:00 check-in on the arrival day, then the first night (as in `guest-stay.md`; the design's "24 h" is example content); Non-refundable charges the full stay; corporate free until 24 hours. No-show penalty = late-cancellation penalty.*
11. **Restrictions in Stage 1 and how the desk treats them:** *Default: closed, closed to arrival and min stay only. At the front desk they show as a warning and can be booked through with a reason (audit event, not an exception); online channels always enforce them (Stage 4).* The alternative is to block at the desk too, which is stricter but sends agents to a manager for every one-night Saturday walk-in.
12. **Rate calendar in Stage 1:** the stage plan keeps "the rates grid" in Stage 4, but seasons and date prices need a screen. *Default: build only the Rates tab of #8 now (no Channels, Parity or Rooms left), with inline edit and Change dates.*
13. **"Rate lowered for tonight" exception:** *Default: yes, after go-live, with a required reason; only cuts to the current business date's price, not future dates.* Owner may prefer a wider window (tonight and tomorrow) or none.
14. **Front desk can read rates:** *Default: yes, read-only through `reservation.manage`, so agents can quote by phone before brick 4.*
15. **Currency:** *Default: NGN-only plans in v1; foreign guests see a USD/GBP/EUR equivalent in quotes once brick 3 has FX rates.* Some Abuja and Lagos hotels publish USD rates for foreign guests; if pilots need USD-priced plans, they come with the DOMAIN open question on foreign-currency settlement.
16. **How far ahead:** *Default: prices and restrictions up to 2 years after the business date; one Change dates apply up to 366 dates.*
17. **Rate plan import at go-live:** *Default: yes, in brick 17 (standard prices and terms, as the `data-import` skill lists); seasons and date prices by hand.* Answers the open question in `going-live.md`.
18. **Plans across hotels:** *Default: no group-wide plans or copy between hotels in v1; Duplicate works within a hotel.* `docs/PRODUCT.md` principle 6 ("a rate … set up once") is met for corporate accounts, not room prices, which differ by city.
19. **Plan name:** *Default: "Best available" with code `BAR`, as in the designs; staff can rename it.*
20. **Legal check, price display (verify against current law, don't assume):** whether Nigerian consumer protection rules (e.g. the Federal Competition and Consumer Protection Act 2018 and FCCPC guidance) or state tourism rules require advertised room prices to include VAT, consumption tax and service charge. Until confirmed: staff screens say "excl. taxes and service charge" on every price, and every guest-facing total (brick 4 confirmations, Stage 4 booking engine) shows the taxes and the total before the guest commits.
