# Taxes, service charge, payment methods and FX rates

- **Status:** built (Stage 1 brick 3, 2026-11-26; approved by the owner 2026-11-26, see Decisions)
- **Stage:** 1 (brick 3 of the plan in [stage-1-plan.md](stage-1-plan.md)). Depends on hotels and companies (owning company, VAT registered, state, business date, go-live) and brick 1b (hotel switch). Branched from `main`, so it doesn't touch rate plan code or screens (brick 2 is in an open pull request). Feeds brick 4 (quotes with taxes, the **Guest pays per night** column and editor preview on rate plans, FX equivalents for foreign guests), brick 10 (tax lines on postings, payments by method, foreign cash), brick 11 (matching transfers and terminal settlements), brick 13 (room and tax charges at night audit) and Stage 3 (POS bills).
- **Module:** Finance (taxes, payment methods and FX rates, `docs/PRODUCT.md` module 7)
- **Walkthroughs:** `going-live.md` step 1 (changed) and a new step 4a, listed under "Changes needed in walkthroughs". Read later by `front-desk-morning.md` steps 4–5, 7, 9 and 11, `night-audit.md` step 9 and the starred amounts in `00-golden-thread.md`.
- **Screens:** Tax and charges configuration and Payment methods, bank accounts, POS terminals (#27: `TaxSetup.dc.html` with `TaxRules`, `TaxRulesM`, `TaxSchedule`, `TaxEmpty`, `TaxLoading`, `TaxError`, `TaxOffline`, `PayMethods`, `PayMethodsDark`, `PayMethodsM`); FX rates (pattern, from the FX rate field in `DSComponents.dc.html`); the Home setup checklist (`OnbHome`). `TaxSummary.dc.html` is the Stage 5 finance screen, not this brick.
- **Decisions:** `0004-money-folios-and-ledger.md`, `0005-statutory-rules-as-data.md`, `0006-business-date-and-night-audit.md`, `0013-designs-as-source-of-truth.md`, `0021-feature-switches.md` (behind `front_desk`). No new decision record needed unless the owner moves away from the default in Decision 2 (foreign-currency folios).

## Problem
Every bill a Nigerian hotel prints carries service charge, VAT and, in most states, a state consumption tax. Today the rates sit in the old PMS or in a cashier's head, nobody can say when one changed or who changed it, and the 2025 tax acts mean the numbers may move again. Before Vento can quote a room, post a night or take a payment, it needs three things it doesn't have: the taxes in force for each hotel on each business date, which ways the hotel takes money (and into which bank account, through which POS terminals), and the day's exchange rate for the guest who pays in dollars. A transfer account or a POS terminal nobody recorded is also where money leaves the hotel unseen.

## Persona and job
- **Finance** (Kunle Ade, group finance, laptop): sets up each hotel's taxes once at go-live and checks them against the law (about 10 minutes per hotel), schedules a change when the law or the hotel's policy changes (a few times a year), keeps the bank accounts and POS terminals right (a few times a year).
- **Owner** (Mrs Adaeze Okafor): same rights. Sees every change after go-live in the next morning's report, and gets an email at once if the account guests pay into changes.
- **GM** (Tunde Bello, laptop): reads his hotel's taxes and payment setup; enters the day's CBN rate each morning when the hotel takes foreign cash (under 30 seconds, daily).
- **Front desk and cashiers** (Chiamaka, Halima): never open these pages. They see the results from brick 4 on: tax lines on quotes and folios, the methods and terminals in Take payment, the rate on a dollar payment.

## Success looks like
- A new hotel's taxes set up in 1 click and under a minute, without typing a rate.
- Every tax line in Vento, on screen, on the device and on the server, comes from one pure function; inclusive lines always add up to the price to the kobo, and exclusive totals always equal price plus lines (property-based tests).
- A rate change scheduled in under 1 minute and 3 clicks after typing. A posted tax line never changes when a rule changes (test from brick 10).
- Today's FX rates entered in under 30 seconds.
- Every change to taxes, bank accounts, the guest transfer account or POS terminals after go-live is in the next owner's daily report with the name and reason; a change to the guest transfer account also reaches the owners by email within a minute.
- No tax rate anywhere in application code: rates exist only as data, and every seeded rate is marked "To verify" until someone records its legal source.

## User flow
Kunle Ade, finance, with whole-group access. Kora Victoria Island is in its setup week, business date 13 Nov 2026 (`going-live.md` step 4a). The hotel is in Lagos and owned by Kora Hospitality Ltd (VAT registered).

**A. Taxes (3 clicks, plus typing sources)**
1. Home's setup checklist shows **Set up taxes and payments** ("VAT, consumption tax, service charge and where guests pay"). He clicks it: **Settings › Taxes and charges** is empty for this hotel. "No taxes set up. Pick the state for this property and we'll add VAT, its consumption tax and a service charge with today's rates. You can change each one." He clicks **Set up for Lagos** (click 1).
2. The page shows three cards: **VAT** 7.5% (every hotel in the group, paid to NRS), **Lagos consumption tax** 5% (Lagos hotels, paid to Lagos State IRS), **Service charge** 10% (this hotel only). Each current rate carries an amber **To verify** badge. Below, **How a bill adds up** shows Rooms ₦150,000.00 excl. taxes → service charge ₦15,000.00 + VAT ₦11,250.00 + consumption tax ₦7,500.00 = **₦183,750.00**.
3. He checks VAT against the current law, clicks **Mark verified** on the VAT row (click 2), types the source ("Nigeria Tax Act 2025, s. …") and clicks **Mark verified** (click 3). He does the same for the other two. The badges turn to "Verified · Kunle Ade · 13 Nov 2026". The checklist's taxes half is done.

**B. Payments (about 8 clicks)**
4. **Settings › Payments**: Cash, Bank transfer, POS terminal and City ledger are on; Online card shows "Comes with online payments". He clicks **Edit** on Cash, ticks US dollar and British pound, **Save** (3 clicks). The Cash row now reads "NGN · USD · GBP" with "No USD rate yet. Enter today's FX rates."
5. **Bank accounts › Add**: Zenith Bank, 0123454471, "Kora Hospitality Ltd", NGN, ticks "Guests at Kora Victoria Island pay transfers into this account", **Add account** (2 clicks after typing).
6. **POS terminals › Add**: Moniepoint, "Desk 1", terminal ID 2MPT4471, settles into Zenith Bank ••••4471, **Add terminal** (2 clicks after typing). He adds "Calabash" and "Pool bar" the same way. The checklist step is done.

**C. FX rates (1 click after typing)**
7. Each morning Tunde presses ⌘K, "Enter today's FX rates". **Settings › FX rates** opens with "Rates for 13 Nov 2026" focused on US dollar. He opens the CBN rates page from the link, types 1,620.00 and 1,950.00 for the pound, and clicks **Save rates** (1 click). Toast "FX rates for 13 Nov 2026 saved". The USD card's 30-day line moves.

Front desk sees none of this until brick 4: "Deluxe King · ₦150,000.00 + taxes = ₦183,750.00 per night · ≈ $113.43 at ₦1,620/$, CBN, 13 Nov 2026".

## Acceptance criteria

### Main path
**What this brick delivers**
1. Taxes and charges as versioned data per group, state and hotel, with the **Taxes and charges** page.
2. The shared calculation `taxLines` in `@vento/shared` and the server lookup of the rules in force.
3. The **Payments** page: payment methods per hotel, bank accounts per company, POS terminals per hotel. Configuration only; no money is taken.
4. The **FX rates** page and the shared FX display helper.
5. The Home checklist step, ⌘K entries and the demo seed.

**Taxes and charges: the model**
- A **tax or charge** has a kind, a name, a scope, who it is paid to, and dated **rates**:
  - **VAT** (`vat`): one per group, scope the whole group, paid to "NRS".
  - **State tax** (`state_tax`): scope one state (`LA`, `FC`, `RI`…); applies to every hotel of the group in that state. Name like "Lagos consumption tax", paid to the state's revenue service. A state may have more than one (a levy).
  - **Service charge** (`service_charge`): scope one hotel; at most one per hotel. Kept by the hotel ("paid to" is blank).
- Each **rate** (a version) has: rate % (above 0, up to 100, up to 2 decimals), the **tax categories** it applies to, what it is **calculated on** (the charge, or the charge plus service charge; service charge itself is always on the charge), a **start date** (a business date), the **source** (act, law or circular and section; for service charge, the decision), **set by**, a **reason**, and **verified by / verified on** (blank until verified). A version may instead be a **stop** ("not charged from 1 Jan 2027").
- A rate's end is the day before the next version starts. Status per hotel, against that hotel's business date: **Scheduled** (amber), **Current** (emerald), **Past** (slate), **Stopped** (slate). **To verify** (amber) shows beside any current or scheduled rate with no verification.
- Nothing changes in place. The only changes are: set up, schedule a change (or a stop), cancel a scheduled change, mark verified, rename or change "paid to", add a state tax or a service charge.
- **Tax categories** (fixed vocabulary in `@vento/shared`, not statutory values): `accommodation` (Rooms), `food` (Food), `beverage` (Drinks), `events` (Events), `laundry` (Laundry), `other` (Other services), `exempt` (No tax: never gets a line). Rate plans (brick 2) post the room part as `accommodation` and the meal allocation as `food`; menu items and charge codes pick theirs later.
- **VAT and the owning company:** VAT lines apply only when the hotel's owning company is VAT registered on that business date (the hint "Turns VAT on for this company's hotels' charges once taxes are set up" is already on the company sheet). A company's scheduled VAT change takes effect at night audit, as built. To verify in Decision 1.

**Taxes and charges: the page** (Settings › Taxes and charges, a hotel page)
- Header "Taxes and charges · Kora Victoria Island · Lagos · every rate has a start date; nothing changes in place", and **Add a tax or charge**.
- An inset states the order and base in force, generated from the rules: "Order: service charge, VAT and consumption tax are each calculated on the net charge, then shown as separate lines on every bill." Lines always appear in that order: service charge, VAT, then state taxes. No ordering setting.
- One card per tax or charge that applies to this hotel: name, scope in words ("Every hotel in the group", "Kora Victoria Island and Kora Ikeja GRA", "Kora Victoria Island only"), categories, paid to; and a table of its rates: Rate · Effective · Set by · Status · action (**Cancel change** on a scheduled one, **Mark verified** where needed). **Schedule a change** on each card.
- **Schedule a change** (side sheet; bottom sheet on phones): new rate or **Stop charging it**, starts on, applies to (category pills), calculated on (taxes only), source, reason (required), and a live example from `taxLines` ("Example: ₦150,000.00 room → service charge ₦18,750.00 instead of ₦15,000.00."). **Schedule change** (⌘↵).
  - Starts on must be after the current business date of every hotel the tax covers (the earliest date is shown in the hint). At most one scheduled change per tax at a time.
- **Mark verified** (small sheet): source (required, pre-filled with what's there), "Recorded with your name and today's date." → **Mark verified**.
- **Add a tax or charge**: a state tax or levy for this hotel's state (name, paid to, rate, categories, calculated on, starts on, source, reason), or a service charge if this hotel has none.
- **How a bill adds up** (replaces the design's "Price basis by department" card, see CHANGES): pick a category and an amount, switch **Price excl. taxes / Price incl. taxes**, and see each line, any rounding and the total, using the rules in force on the business date (or a date picked, to preview a scheduled change). It is a preview, not a setting: inclusive or exclusive is set per rate plan (brick 2) and per menu (Stage 3).
- **Set up for Lagos** (empty state; the button names the hotel's state) adds, in one transaction, whatever is missing: VAT for the group (if the group has none), the state's consumption tax from Vento's template (if the group has none for that state and a template exists), and a 10% service charge for the hotel. Each starts on the hotel's current business date, except VAT, which keeps its history ("since 1 Feb 2020"). Every rate is marked **To verify** with the source "Vento default · illustrative · verify against the Nigeria Tax Act 2025 before go-live". Templates are seed data used only by this button; calculations read only the group's own rules.

**The calculation (the seam for bricks 4, 10, 13 and Stage 3)**
- `taxLines` in `@vento/shared`, pure, on decimal.js through the money helpers. Input: amount (string), currency, pricing (`exclusive` | `inclusive`), category, and the rules in force (as returned by the server). Output: `net`, `lines` (tax id, rate id, kind, name, rate, base, amount), `rounding`, `gross`.
  - **Exclusive:** net = amount. Each line's base is the net (or net + service charge, if that rule says so); amount = base × rate, rounded once, half-up, to the kobo. Gross = net + lines. Rounding is ₦0.00.
  - **Inclusive:** gross = amount. Net = gross ÷ (1 + the combined effective rate), rounded half-up to the kobo; lines are then computed from the net as above; any difference between gross and net + lines goes on one explicit **rounding** line (a few kobo, positive or negative), part of the charge's net revenue, never of a tax. Example, ₦5,000.00 cashew nuts incl. taxes: net ₦4,081.63, service charge ₦408.16, VAT ₦306.12, consumption tax ₦204.08, rounding ₦0.01, total ₦5,000.00.
  - Category `exempt`, or no rule for the category: no lines; net = gross.
  - Lines are never recomputed for a reversal: brick 10 reverses by copying the stored lines negated.
- Server, in the taxes service: `taxRulesInForce(propertyId, businessDate)` (organization from the auth context) returns the rates in force for that hotel on that date: group VAT (when the owning company is VAT registered that day), the hotel's state taxes, its service charge. `quoteTaxLines(propertyId, businessDate, category, amount, pricing)` combines it with `taxLines`. A hotel with no taxes set up answers `TAXES_NOT_SET_UP` ("Kora Abuja's taxes aren't set up yet. Ask finance to set them up."); bricks 4, 10 and 13 refuse to quote or post rather than charge without taxes.
- Quotes for future nights use the rules in force on each night's date, so a scheduled change shows in quotes for those nights at once.
- **Wiring into rate plans** (the **Guest pays per night** column on the first-rate table and the editor preview) happens in **brick 4**, the first brick with both bricks merged. This brick doesn't change rate plan code or screens.

**Payments** (Settings › Payments, a hotel page)
- **Payment methods** for the hotel, a fixed list, each **On** or **Off**: Cash, Bank transfer, POS terminal, City ledger (used from brick 12), Online card (Paystack; shown as "Comes with online payments" and can't be switched on yet). `voucher` and `complimentary` aren't configured in Stage 1 (vouchers come with travel agents in Stage 4; a comp is a permissioned action, not a way of paying).
  - Columns: Method · Currencies · Reference taken · On. References are fixed, not settings: Cash "–", Bank transfer "Bank session reference", POS terminal "Terminal and RRN", City ledger "Corporate account", Online card "Automatic".
  - **Currencies:** cash is always NGN plus any of USD, GBP and EUR ticked under **Edit**; bank transfer takes the currencies of the company's active bank accounts; POS terminal, city ledger and online card are NGN.
  - Defaults for a hotel: Cash (NGN), Bank transfer, POS terminal and City ledger on; Online card off. At least one method stays on.
  - Switching is reversible at once with an undo toast.
- **Bank accounts** belong to the hotel's owning company and are shared by every hotel it owns ("Also used by Kora Ikeja GRA"). Fields: bank (from `NIGERIAN_BANKS` in `@vento/shared`, with Other), account number (10 digits, NUBAN), account name (as the bank shows it), currency (NGN, USD, GBP, EUR). Bank + account number are unique in the group. Shown masked in lists (`Zenith Bank · ••••4471 · NGN`), in full in the edit sheet. Archive and restore; an account that is a hotel's guest transfer account, or that a POS terminal settles into, can't be archived until those point elsewhere.
- **Guest transfer account:** one NGN account per hotel, ticked on the account ("Guests at Kora Victoria Island pay transfers into this account"). Deposit requests and confirmations (brick 4 on) quote it. With bank transfer on and no guest transfer account, the Bank transfer row shows amber "No account for guest transfers".
- **POS terminals** belong to the hotel. Fields: provider (suggestions: Moniepoint, OPay, Palmpay, the banks; or typed), name ("Desk 1"), terminal ID (1–20 letters and digits, unique in the group, archived included), settles into (one of the company's NGN bank accounts). Shown as "Moniepoint · Desk 1 · TID 2MPT4471", with status Active or Archived. Archive and restore. From brick 10, a POS terminal payment can only name an active terminal of the hotel, so a terminal nobody registered can't take the hotel's money in Vento.

**FX rates** (Settings › FX rates, a group-wide page)
- One rate per currency (USD, GBP, EUR) per **rate date**, for the whole group: naira per 1 unit, above 0, up to 4 decimals, source **CBN official** (market rates: Decision 3). Stored with who entered it and when.
- "Rates for 25 Nov 2026" card: the date defaults to today in Lagos and can be set back to fill a missed day, never forward. A field per currency (blanks allowed), a link "Open the CBN rates page", **Save rates**.
- One card per currency: the latest rate, its date and who entered it, and a 30-day line (Recharts). Below, the history table: Date · Currency · Rate · Source · Entered by, server-paginated.
- **Typo guard:** a rate more than 10% away from the previous one asks to check it ("₦16,200.00 is 10 times the last USD rate (₦1,620.00 on 24 Nov). Check the figure.") with **Save anyway**.
- **Replacing** a rate already entered for that date asks for a reason and keeps the old row as superseded. Payments already taken keep the rate stored on them (brick 10).
- **Which rate a hotel uses:** the latest CBN rate dated on or before the hotel's business date, returned with its date and age (`fxRateFor(currency, businessDate)`). Brick 10 shows the age when it is more than 1 day old and asks for today's rate when there is none.
- **Display helper** in `@vento/shared`: `fxEquivalent(amountNgn, fxRate)` → the foreign amount, rounded half-up to the cent, and the text `≈ $113.43 at ₦1,620/$, CBN, 25 Nov 2026`. Never stored on rates or charges. Brick 4 uses it in quotes for foreign guests.

**Home, ⌘K and navigation**
- Settings gains **Taxes and charges**, **Payments** and **FX rates**, shown per permission (below).
- Home's setup checklist gains **Set up taxes and payments**, done when the hotel's taxes are set up and every rate in force is verified, and, if bank transfer is on, the hotel has a guest transfer account.
- ⌘K: "Taxes and charges", "Payments", "FX rates", "Enter today's FX rates", "Add POS terminal", "Add bank account".

### Organization isolation
- Taxes, rates, payment method settings, bank accounts, POS terminals and FX rates carry `organizationId`; every read and write filters by the organization from the auth context. An id from another group answers "not found". Vento's templates have no customer data and are only copied in by **Set up for …**.

### Property scoping
- Taxes and charges and Payments are **hotel pages** (`docs/UX-STANDARD.md` §8). With All hotels: "Taxes are set per hotel. Pick a hotel." / "Payments are set per hotel. Pick a hotel." Links carry `?hotel=`.
- FX rates is a **group-wide page**: the same with any hotel selected, marked "Same for every hotel".
- Scope rules for members limited to some hotels, matching the company rule in `docs/DOMAIN.md`:
  - VAT (group scope): only members with whole-group access can change it. Others see it read-only with "VAT applies to every hotel in the group. Only someone with whole-group access can change it."
  - A state tax: only when every active hotel of the group in that state is within their access.
  - Service charge, payment methods and POS terminals: for hotels within their access.
  - Bank accounts: only when every active hotel the company owns is within their access.
- The server enforces all of it; a hotel outside access answers `PROPERTY_NOT_FOUND`.

### Permissions, limits and approvals
Nothing in the matrix fits: "Manage companies, properties, people and their access" is owner and group admin only, and finance needs this without managing people. Two new rows (Decision 5):

| Action | front_desk | cashier | waiter | revenue_manager | fnb_manager | general_manager | finance | owner / group_admin |
|---|---|---|---|---|---|---|---|---|
| Set up taxes, payment methods, bank accounts and POS terminals (`finance.setup`) | – | – | – | – | – | – | ✓ | ✓ |
| Enter FX rates (`fx.enter`) | – | – | – | – | – | ✓ | ✓ | ✓ |

- **Reading:** Taxes and charges is read-only for members with `rates.edit` or `rooms.setup` (they price rooms); Payments is read-only for `rooms.setup` and `fx.enter`; anyone who can see Payments can read FX rates.
- No limits and no approvals. The design's "Schedule · owner PIN" is replaced by a required reason and the "setup changed" exception (approvals arrive in brick 5, after this brick, and an exception the owner reads is enough for a change made a few times a year).
- Refused in a PIN session on a shared device, like `rooms.setup` and `rates.edit`: these change on a personal sign-in.
- Gated by the `front_desk` feature switch.
- Permission denied: "Only finance or the owner can change taxes and payment setup. Ask your finance team." / "Only a GM, finance or the owner can enter FX rates."

### Audit events
All in the same transaction as the change, with actor, device, property (or none for group-wide), business date, before/after and reason:
- `taxes.set_up` (hotel, state, what was added, batch id), `tax.created`, `tax.changed` (name, paid to)
- `tax_rate.scheduled` (tax, rate or stop, categories, calculated on, start, source, reason), `tax_rate.cancelled` (reason), `tax_rate.verified` (source)
- `payment_method.changed` (method, on/off, cash currencies)
- `bank_account.created`, `bank_account.changed`, `bank_account.archived`, `bank_account.restored`, `property.transfer_account_set` (before and after account, masked)
- `pos_terminal.created`, `pos_terminal.changed`, `pos_terminal.archived`, `pos_terminal.restored`
- `fx_rate.entered` (currency, rate date, rate), `fx_rate.replaced` (before, after, reason)
- Flags in `after`: `liveProperty: true` and `exception: 'setup_changed'` on the events listed below.

### Leakage exceptions
- No new exception type. **Setup changed** gains these triggers, only when a hotel the change covers is live:
  - a tax or charge added, a rate scheduled or stopped, a scheduled change cancelled;
  - a bank account added, changed or archived for a company owning a live hotel; a hotel's guest transfer account changed;
  - a POS terminal added, changed or archived.
- A reason is required for these after go-live ("Recorded with your name. This shows in the owner's daily report."), and always for tax rate changes.
- Owner's daily report lines (brick 16), in the report of every live hotel the change covers:
  - "Setup changed · Service charge at Kora Victoria Island 10% → 12.5% from 1 Jan 2027 · Kunle Ade · Reason: staff pool review"
  - "Setup changed · Guest transfer account at Kora Victoria Island: Zenith Bank ••••4471 → Access Bank ••••0398 · Kunle Ade · Reason: …"
  - "Setup changed · POS terminal added at Kora Victoria Island: OPay · Pool bar 2 (TID 3OPY7710) · Kunle Ade · Reason: …"
- Verifying a rate, switching payment methods and entering FX rates raise nothing (audited only). The FX rate used on each foreign payment is checked in brick 10.
- **Immediate email to owners** (and group admins) when a live hotel's guest transfer account changes, or an account that is one is changed: a diverted transfer account can cost a day's deposits before the morning report.

### Offline behaviour
- All three pages need a connection to change anything. Offline they show cached data with the design banner: "Offline since 17:32. Tax and payment settings are read-only offline. Bills keep using the rules saved on each device." (FX rates: "Offline since 17:32. FX rates are read-only offline."). Buttons are disabled with "Needs a connection". Nothing is queued.
- Registered devices of a hotel cache its rules in force and scheduled (for the next 60 days), its payment methods and terminals, and the latest FX rates, so offline charges (brick 10, Stage 3) compute the same tax lines locally with `taxLines`. The server is the authority and recomputes on sync with the rules in force on the posting's business date.

### Business date
- Tax lines use the rules in force on the posting's business date for the hotel, never the clock. A charge for 25 Nov posted at 00:30 on 26 Nov uses 25 Nov's rules (`night-audit.md` "Tax rule changes at midnight").
- A change starts after the current business date of every hotel it covers ("The earliest is 26 Nov 2026."), so a day is never charged at two rates. Statuses (current, scheduled, past) follow the selected hotel's business date.
- **Set up for …** starts the hotel's service charge and state tax on its current business date ("since 13 Nov 2026"); before that date nothing is charged.
- FX: the latest rate dated on or before the hotel's business date.

### Tax lines
- This brick defines them; it posts none. Each line carries tax id, rate id (the version), kind, name, rate, base and amount, plus a rounding amount per charge; bricks 10 and 13 store them on postings and never recompute them.
- Rounding: each line half-up to the kobo, once; inclusive prices put any difference on one rounding line so lines sum to the price.
- What the folio, receipt and invoice show (bricks 10 and 12): service charge, VAT and each state tax as separate lines under the charge; a rounding line only inside the expanded breakdown.
- All seeded rates are illustrative and **To verify** (Decision 1).

### Foreign currency
- Charges and tax lines are NGN in v1. Foreign currency enters as **tender**: cash in USD, GBP or EUR where the hotel accepts it, converted at the CBN rate in force and posted in naira (brick 10 stores the foreign amount, rate, source and rate date on the payment). See Decision 2.
- This brick stores the rates and provides `fxRateFor` and `fxEquivalent`; it converts no money.

### Availability locking
Not relevant: nothing here changes sellable rooms.

### Empty, error and edge cases
- **No taxes set up:** the empty state above. For a state with no template: "No consumption tax on file for Rivers. If your hotels there pay one, add it." The button then adds VAT and service charge only.
- **Second hotel in a state already set up:** **Set up for Lagos** adds only the service charge: "VAT and Lagos consumption tax are already set up for the group."
- **Owning company not VAT registered:** the VAT card shows slate "Not charged at Kora Port Harcourt: Kora PH Ltd isn't VAT registered".
- **Start date too early:** "Changes start after the business date. The earliest is 26 Nov 2026." For VAT, the hint names the hotel with the latest business date when they differ.
- **A change already scheduled:** "Service charge already has a change scheduled for 1 Jan 2027. Cancel it first."
- **Rate out of range:** "Enter a rate above 0% and up to 100%. To stop charging it, choose Stop charging it."
- **No category picked:** "Pick at least one kind of charge."
- **Hotel moves state** (address changed on Settings › Hotels): the next charge uses the new state's taxes; posted lines never change. The hotel sheet warns before saving: "Lagos consumption tax stops and FCT taxes apply to new charges at Kora Victoria Island."
- **Bank account taken:** "Zenith Bank ••••4471 is already set up for Kora Hospitality Ltd."
- **Account number:** "Enter the 10-digit account number."
- **Archive blocked:** "Zenith Bank ••••4471 is where Kora Victoria Island's guests pay transfers. Choose another account first." / "Moniepoint · Desk 1 settles into this account. Point it to another account first."
- **Terminal ID taken:** "Terminal 2MPT4471 is already set up at Kora Ikeja GRA." (archived: "… belongs to an archived terminal. Restore it.")
- **Last method off:** "Keep at least one payment method on."
- **Foreign cash on, no rate:** Cash row: "No USD rate yet. Enter today's FX rates." Stale: "Latest USD rate is from 20 Nov 2026. Enter today's FX rates."
- **Future FX date:** "Rates can't be entered for future dates."
- **Two people editing:** each save sends the version it started from; the second gets "Kunle Ade changed Service charge at 14:02. Reload to see the change, then save again."
- **Archived hotel:** its taxes, methods and terminals stay, read-only; its service charge isn't offered for scheduling.
- **Load error:** "Couldn't load tax rules. Nothing changed. Bills keep using the rules in force." → **Try again** (Payments: "Couldn't load payment settings. …").
- **Long names** truncate with a tooltip; tables become cards below `md`.

## Behind the scenes
- **Folio postings:** none in this brick.
- **Night audit (brick 13):** posts room charges with `quoteTaxLines` for that business date; its pre-checks block when the hotel's taxes aren't set up, and the first audit (go-live) blocks while any rate in force is **To verify** (Decision 1).
- **Ledger (Stage 5):** maps each tax to a payable account by "paid to", each method and terminal to a clearing account, each bank account to a bank ledger account (the design's "Posts to" and "Ledger" columns return then). Tax lines and payment rows from brick 10 on carry everything needed.
- **Jobs:** one pg-boss job, `notify.transfer_account_changed`, keyed by the audit event id (idempotent, retried), sends the owners' email through `EmailProvider`. No other jobs; FX rates are typed (Decision 4).
- **Notifications:** the email above; everything else through the owner's daily report (brick 16).
- **Data import at go-live:** nothing to import. Taxes are set up with one click and verified; bank accounts and terminals are a handful, added by hand; FX rates are typed from the go-live date. Imported deposits (brick 17) carry their own method and reference.

### Demo seed
Illustrative, every rate **To verify** except as noted, matching the designs:
- **VAT**, whole group, paid to NRS: 5% until 31 Jan 2020, 7.5% from 1 Feb 2020; Rooms, Food, Drinks, Events, Laundry, Other services; on the charge.
- **Lagos consumption tax** (`LA`), paid to Lagos State IRS: 5% from 1 Jan 2025; Rooms, Food, Drinks, Events; on the charge. **FCT** and **Rivers** consumption taxes the same (5%, from 1 Jan 2025), added by hand in the seed as in `TaxSummary`; no template for them.
- **Service charge** 10% at every hotel from 1 Jan 2025; Rooms, Food, Drinks, Events. At Kora Victoria Island also a scheduled change to 12.5% from 1 Jan 2027 by Kunle Ade, reason "Staff pool review", so the Scheduled state can be seen (quotes for nights from 1 Jan 2027 include it).
- Kora Victoria Island's VAT and Lagos consumption tax marked verified by Kunle Ade (source "Illustrative: demo only"), so both badge states show.
- **Payment methods:** Cash (NGN, USD, GBP at Kora Victoria Island; NGN elsewhere), Bank transfer, POS terminal, City ledger on; Online card off.
- **Bank accounts**, Kora Hospitality Ltd: Zenith Bank 0123454471 NGN (guest transfer account for Kora Victoria Island and Kora Ikeja GRA) and Zenith Bank 0123459012 USD. One NGN account each for Kora Hotels Abuja Ltd and Kora PH Ltd.
- **POS terminals**, Kora Victoria Island: Moniepoint · Desk 1 (TID 2MPT4471), Moniepoint · Calabash (2MPT4472), OPay · Pool bar (3OPY7709), all settling into Zenith ••••4471. One Moniepoint terminal at each other hotel.
- **FX rates:** the 30 days to 25 Nov 2026, ending USD ₦1,620.00 (as in the designs), GBP ₦1,950.00 (as in `guest-stay.md`) and EUR ₦1,870.00, entered by Kunle Ade.

### Owner's review (what to try)
Sign in as `kunle@kora.example`, Kora Victoria Island selected:
1. Settings › Taxes and charges: three cards, Scheduled 12.5% on service charge, To verify badges; **How a bill adds up** with ₦150,000 Rooms, then inclusive ₦5,000 Food (rounding ₦0.01).
2. Schedule VAT to 8% from tomorrow with a source and reason; cancel it.
3. Switch to Kora Port Harcourt: Rivers consumption tax; switch to All hotels: "Pick a hotel".
4. Settings › Payments: tick Euro on Cash; add a bank account and a POS terminal; try archiving Zenith ••••4471.
5. Settings › FX rates: enter today's USD as 16,200 and see the check; then 1,625.
6. Sign in as `tunde@kora.example`: taxes read-only, FX rates editable. As `chiamaka@kora.example` on the shared PC: none of these pages.

### Changes needed in `docs/DOMAIN.md`
1. **Taxes and charges** section, rows rewritten:
   - **VAT:** "Federal tax, one per group, with dated rates and the categories it applies to. Charged only when the hotel's owning company is VAT registered on that business date. Rates are data to verify against current law."
   - **Consumption tax:** "State tax (`state_tax`), one or more per state per group (e.g. Lagos consumption tax, paid to Lagos State IRS), applying to every hotel of the group in that state, with dated rates."
   - **Service charge:** "Hotel charge, at most one per hotel, configured with dated rates like a tax; not paid to an authority. May be distributed to staff through payroll."
   - **Tax line:** "Each tax or charge computed on a posting: tax, rate version, rate, base and amount, rounded half-up to the kobo once. Stored at posting, never recomputed; reversals copy them negated."
   - **Inclusive / exclusive pricing:** "Per rate plan and menu. Inclusive prices back out the net and put any rounding difference on one rounding line, so the lines sum to the price."
2. New terms (Taxes and charges): **Tax rate** ("A dated version of a tax or charge: rate %, categories, calculated on the charge or the charge plus service charge, start date, source, reason, verified by and on. Status `scheduled`, `current`, `past` or `stopped`. Never edited in place; a change is a new version starting after the business date of every hotel it covers"); **Tax category** ("What kind of sale a charge is, for tax: `accommodation`, `food`, `beverage`, `events`, `laundry`, `other`, `exempt`"); **To verify** ("A rate in force with no recorded legal source and verifier; seeded rates start this way"); **Rounding line** ("The kobo difference on an inclusive price, part of net revenue").
3. **Payment method** row: "Per hotel, each on or off: `cash` (NGN plus chosen foreign currencies), `bank_transfer`, `pos_terminal`, `city_ledger`, `card_online` (Paystack, from Stage 4). `voucher` and `complimentary` aren't configured in Stage 1. The reference each takes is fixed. Each maps to a ledger account from Stage 5."
4. New terms (Folios, payments): **Bank account** ("A company's account: bank, 10-digit account number, account name, currency; unique in the group; shown masked"); **Guest transfer account** ("The NGN account a hotel's guests are told to transfer to; changing it on a live hotel emails the owners at once"); **POS terminal** ("A card terminal registered to a hotel: provider, name, terminal ID unique in the group, the bank account it settles into. POS payments must name one").
5. New term **FX rate** (Folios, payments): "Naira per unit of USD, GBP or EUR for a rate date, group-wide, source CBN official, up to 4 decimals. A hotel uses the latest rate dated on or before its business date. Payments store their own copy."
6. **Permissions matrix:** the two rows above (`finance.setup`, `fx.enter`), and in the notes: "Reading taxes comes with `rates.edit` or `rooms.setup`; reading payment setup with `rooms.setup` or `fx.enter`. VAT can be changed only with whole-group access, a state tax only when every hotel of the group in that state is within access."
7. **Exception** list: extend "setup changed" with "tax or charge added, scheduled, stopped or cancelled; bank account added, changed or archived; guest transfer account changed; POS terminal added, changed or archived".
8. **Locale defaults:** "FX rates are naira per unit, CBN official, entered daily."
9. **Open questions:** settle "Foreign-currency guests" and the "which states' consumption tax rules to ship first" half of the e-invoicing line with the owner's answers to Decision 2 and 7; add the CBN fetch question if Decision 4 keeps typing.

### Changes needed in walkthroughs (product-manager, same change as the build)
- `going-live.md` step 1, behind the scenes: replace "Taxes (#27) come pre-filled from Vento's versioned rules for Lagos: VAT, Lagos consumption tax, and a 10% service charge she confirms. She doesn't type any rates." with "Taxes and payments are set up in step 4a."
- `going-live.md` new step 4a, **Fri 13 Nov, 11:30 · Taxes and payments:** "*Does:* Kunle Ade (finance) clicks **Set up taxes and payments** on the checklist, then **Set up for Lagos**. He checks VAT, Lagos consumption tax and the 10% service charge against the current law and marks each verified with its source. On Payments he ticks USD and GBP for cash, adds Zenith Bank ••••4471 as the guest transfer account and the three Moniepoint and OPay terminals. *Sees:* 'How a bill adds up': ₦150,000.00 + ₦15,000.00 + ₦11,250.00 + ₦7,500.00 = ₦183,750.00. *Behind the scenes:* `taxes.set_up`, `tax_rate.verified`, `bank_account.created`, `pos_terminal.created`; nothing reaches the owner's report before go-live."
- `going-live.md` step 12 (parallel run): "Tunde enters the day's CBN rates each morning (⌘K 'Enter today's FX rates')."
- `going-live.md` Becomes tests: "Set up for Lagos adds VAT, Lagos consumption tax and service charge marked To verify; the checklist step is done only once each is verified and a guest transfer account exists."
- `journeys/README.md` demo world: the Taxes line adds "set up with one click and verified by Kunle Ade at Kora Victoria Island; a service charge change to 12.5% is scheduled for 1 Jan 2027"; Other illustrative values: "FX ₦1,620 = $1 (CBN, 25 Nov 2026) and ₦1,950 = £1"; add bank accounts and POS terminals (Moniepoint · Desk 1, Moniepoint · Calabash, OPay · Pool bar).
- `front-desk-morning.md` step 5 and 9: the terminal is "Moniepoint · Desk 1" and transfers go to Zenith ••••4471 (wording only, when brick 10 lands).

### Changes needed in `docs/design/screen-inventory.md` and `docs/design/CHANGES.md` (frontend, with the build)
- Inventory: "Tax and charges configuration" → built (Stage 1 brick 3); "Payment methods, bank accounts, POS terminals" → built; "FX rates" → built (pattern).
- CHANGES:
  - "Price basis by department" card replaced by **How a bill adds up** (a preview): inclusive or exclusive is per rate plan and per menu.
  - "Schedule · owner PIN" becomes **Schedule change** with a required reason and the setup changed exception; the hint "Bookings made before then keep the old rate if guaranteed" becomes "Charges from then use the new rate, including stays already booked" (tax follows the date of the charge).
  - "Applies to" pills use tax categories (Rooms, Food, Drinks, Events, Laundry, Other services); "Minibar" goes (minibar items are food or drinks); "70% to the staff pool" waits for payroll (Stage 5).
  - Payments: "Posts to" and "Ledger" columns wait for Stage 5; "Add payment method" becomes on/off switches on a fixed list; the "Room charge" row goes (posting to a room is how POS settles in Stage 3, not a payment method); Paystack is shown as "Online card"; the POS terminal "Where" column folds into the terminal's name.
  - The payment dialog's "Market" FX option comes with brick 10 (Decision 3).

## Reports
No new reports. From the fixed catalogue:
- **Tax report** (VAT, consumption tax by state, service charge): grouped by tax and "paid to" from these rules, from the lines bricks 10 and 13 post.
- **Revenue by department & payment method** and **Cashier / shift report:** use this method list and the terminal names.
- **Owner's daily report:** the setup changed lines above.

## UI copy
- Settings nav: "Taxes and charges" · "Payments" · "FX rates"
- Checklist: "Set up taxes and payments" · "VAT, consumption tax, service charge and where guests pay"
- Taxes page: "Taxes and charges" · "Kora Victoria Island · Lagos · every rate has a start date; nothing changes in place" · inset "Order: service charge, VAT and consumption tax are each calculated on the net charge, then shown as separate lines on every bill."
- Cards: "VAT" · "Every hotel in the group · Rooms, food, drinks, events, laundry, other services · paid to NRS" / "Lagos consumption tax" · "Kora Victoria Island and Kora Ikeja GRA · Rooms, food, drinks, events · paid to Lagos State IRS" / "Service charge" · "Kora Victoria Island only · Rooms, food, drinks, events · kept by the hotel"
- Table: "Rate" · "Effective" · "Set by" · "Status" · cells "since 1 Feb 2020", "1 Jan 2025 – 31 Dec 2026", "from 1 Jan 2027", "Vento default" · badges "Current", "Scheduled", "Past", "Stopped", "To verify", "Verified · Kunle Ade · 13 Nov 2026"
- Buttons: "Set up for Lagos", "Add a tax or charge", "Schedule a change", "Schedule change", "Cancel change", "Mark verified", "Try again"
- Schedule sheet: "Schedule a change · Service charge" · "New rate" · "Stop charging it" · "Starts on" (hint "The earliest is 26 Nov 2026. Charges from then use the new rate, including stays already booked.") · "Applies to" · "Calculated on": "The charge" / "The charge plus service charge" · "Source" (hint "Act, law or circular and section, e.g. Nigeria Tax Act 2025, s. …"; service charge: "The decision, e.g. board meeting, 20 Oct 2026") · "Reason" · example "Example: ₦150,000.00 room → service charge ₦18,750.00 instead of ₦15,000.00."
- Verify sheet: "Mark VAT 7.5% verified" · "Source" · "Recorded with your name and today's date." → "Mark verified"
- Cancel confirm: "Cancel the change to 12.5% from 1 Jan 2027? Service charge stays at 10%." · "Reason" → "Cancel change"
- Preview: "How a bill adds up" · "Price excl. taxes" / "Price incl. taxes" · "Uses the rates in force on 25 Nov 2026." · lines "Service charge 10%", "VAT 7.5%", "Lagos consumption tax 5%", "Rounding", "Total"
- Empty: "No taxes set up" · "Pick the state for this property and we'll add VAT, its consumption tax and a service charge with today's rates. You can change each one." → "Set up for Lagos"
- Payments page: "Payments" · "Kora Victoria Island · what the desk can take, where guests transfer to, and the hotel's POS terminals" · cards "Payment methods", "Bank accounts", "POS terminals" · columns "Method", "Currencies", "Reference taken", "On" · "Comes with online payments" · "No account for guest transfers" · "Also used by Kora Ikeja GRA"
- Cash sheet: "Cash · currencies" · "Naira (always)", "US dollar", "British pound", "Euro" · hint "Foreign cash is taken at the day's CBN rate and posted in naira." → "Save"
- Bank account sheet: "Add bank account · Kora Hospitality Ltd" · "Bank" · "Account number" (hint "10 digits") · "Account name" (hint "As the bank shows it to someone sending money") · "Currency" · "Guests at Kora Victoria Island pay transfers into this account" → "Add account" / "Save account" · "Archive account"
- Terminal sheet: "Add POS terminal · Kora Victoria Island" · "Provider" · "Name" (hint "What staff call it, e.g. Desk 1") · "Terminal ID" (hint "Printed on the terminal and on every slip") · "Settles into" → "Add terminal" / "Save terminal" · "Archive terminal"
- FX page: "FX rates" · "Kora Hotels Group · same for every hotel · ₦ per unit, CBN official rate" · "Rates for 25 Nov 2026" · "US dollar", "British pound", "Euro" (suffix "₦ per $1" etc.) · "Open the CBN rates page" → "Save rates" · history "Date", "Currency", "Rate", "Source", "Entered by"
- FX check: "₦16,200.00 is 10 times the last USD rate (₦1,620.00 on 24 Nov). Check the figure." → "Save anyway" · replace: "USD for 25 Nov 2026 is already ₦1,620.00 (Kunle Ade, 09:05). Replace it? Payments already taken keep the rate they used." · "Reason" → "Replace rate"
- Toasts: "Taxes set up for Kora Victoria Island" · "Service charge change scheduled for 1 Jan 2027" · "Scheduled change cancelled" · "VAT 7.5% marked verified" · "Cash now takes USD · Undo" · "Bank transfer off · Undo" · "Zenith Bank ••••4471 added" · "Moniepoint · Desk 1 added" · "FX rates for 25 Nov 2026 saved"
- Reason after go-live: "Reason" (required) · "Recorded with your name. This shows in the owner's daily report."
- Errors: as in "Empty, error and edge cases" · "Needs a connection"
- Offline: "Offline since 17:32. Tax and payment settings are read-only offline. Bills keep using the rules saved on each device." / "Offline since 17:32. FX rates are read-only offline."
- All hotels: "Taxes are set per hotel. Pick a hotel." / "Payments are set per hotel. Pick a hotel."
- Permission denied: "Only finance or the owner can change taxes and payment setup. Ask your finance team." / "Only a GM, finance or the owner can enter FX rates."
- Owners' email: subject "Guest transfer account changed at Kora Victoria Island" · body "Kunle Ade changed the account Kora Victoria Island's guests pay transfers into, at 14:02 on 25 Nov 2026: Zenith Bank ••••4471 → Access Bank ••••0398. Reason: {reason}. See Payments: {link}"

## Out of scope
- Posting tax lines, taking payments, deposits, refunds, foreign cash at the desk (brick 10); matching transfers and terminal settlements (brick 11); the Tax report itself (brick 15 or Stage 5) and the Stage 5 tax summary, remittances and filing packs (`TaxSummary`).
- Wiring taxes into rate plan screens (brick 4).
- Tax exemptions per guest or corporate account (e.g. diplomatic missions): not in v1; raise with brick 12 if a pilot in Abuja needs it.
- WHT, CIT, PAYE and other statutory rules (Stage 5), e-invoicing and fiscalisation (open in `docs/DOMAIN.md`).
- Ledger accounts on methods, bank accounts and terminals (Stage 5); Paystack setup (online payments, Stage 4).
- Foreign-currency folios, USD-priced rate plans, entering and using market FX rates (brick 10, Decision 3); automatic FX fetching (Decision 4).
- A separate alcoholic drinks category, per-outlet tax settings, custom payment methods, rule ordering settings: add only if the law or a pilot needs them.
- A Vento-wide push of law changes to every customer's rules: each group schedules its own change, with Vento's notice.

## Decisions (owner, 2026-11-26)
1. **Seed rates:** every seeded rate is marked "To verify"; the checklist step isn't done until each is verified with its source, and the first night audit (go-live) won't run while a rate in force is "To verify". Finance or legal verifies VAT, Lagos consumption tax and their bases under the Nigeria Tax Act 2025 before the pilot.
2. **Foreign guests:** folios, charges and tax lines are always in naira. Foreign cash (USD, GBP, EUR, where the hotel ticks them) is accepted as payment from brick 10 and converted at the day's rate, with the foreign amount, rate, source and date stored on the payment; change is given in naira.
3. **Market FX rate: allowed, set by finance.** Rates carry a **source**, `cbn` or `market`. This brick stores and shows CBN rates (and the schema accepts market rates). Entering a market rate (finance only, `finance.setup`, with a reason) and choosing it on a payment (reason required, and an exception on every payment that uses it) land with brick 10.
4. **CBN rate typed daily** by the GM or finance, with a link to the CBN page and the typo check; payments use the latest rate on or before the business date and show its date. Automatic fetching later.
5. **Permissions:** new `finance.setup` (finance, owner, group admin) for taxes, payment methods, bank accounts and POS terminals; new `fx.enter` (GM, finance, owner, group admin) for daily rates. No approval step; a required reason, the setup changed exception after go-live, and an immediate email to owners when a live hotel's guest transfer account changes.
6. **Tax base:** VAT and consumption tax are calculated on the net charge, not on service charge; each rule can be switched to "the charge plus service charge" if finance finds the law requires it.
7. **State templates:** Lagos only; other states added by hand with **Add a tax or charge**; the demo seeds FCT and Rivers by hand.
