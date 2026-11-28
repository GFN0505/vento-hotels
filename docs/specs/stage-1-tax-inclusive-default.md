# Prices include taxes by default

- **Status:** built
- **Stage:** 1 (brick 8b, right after front desk and check-in)
- **Module:** Reservations & Front Desk
- **Walkthroughs:** `guest-stay.md` (the booking's figures), `going-live.md` (first rate), `front-desk-morning.md` and `README.md` demo world (price wording)
- **Screens:** first rate (#19, `OnbRate`), Rate plans list and editor (#33), Rate calendar (#8), Rooms Base rate column (#33), new reservation summary (#5), reservation detail (#5), walk-in (#6), tape chart type header and Room move (#3, #31)
- **Decisions:** [`0032-prices-include-taxes-by-default.md`](../decisions/0032-prices-include-taxes-by-default.md) (supersedes the exclusive default in [stage-1-rate-plans.md](stage-1-rate-plans.md), Open question 5)

## Problem
Most Nigerian hotels quote one all-in price: "₦168,000 a night" is what the guest pays, VAT, Lagos consumption tax and service charge included. Vento's rate plans default to prices before taxes, so a GM typing the hotel's price list gets quotes 22.5% higher than the list, and the front desk has to explain the gap. The option to price all-in exists per plan, but it's hidden under More options and off.

## Persona and job
Kunle (GM) sets rates once at go-live and changes them a few times a season, on a laptop. Chiamaka (front desk) quotes callers and walk-ins many times a day, on the desk PC or a phone. Both want the figure they say to be the figure on the bill.

## Success looks like
- A new hotel's first rate, typed from the printed price list, quotes exactly those prices to guests.
- Every price on screen says whether it includes taxes; nobody adds taxes in their head.
- Hotels that price before taxes still can, per plan, and those plans are visibly marked.

## User flow
1. Kunle opens **Rates › Rate plans** on a hotel with no plans. The first-rate table says "Per room per night, incl. taxes and service charge". He types Deluxe King ₦150,000; beside it, "Before taxes per night ₦122,448.98" (with taxes set up). **Create Best available** (1 click).
2. He opens **New plan**. **Prices include taxes and service charge** is on (under More options, which stays closed). Turning it off opens More options on that plan from then on, and the plan shows an **Excl. taxes** badge in the list.
3. Chiamaka books Deluxe King, Bed & breakfast, 3 nights. The summary reads ₦168,000 per night, **Total ₦504,000.00**, then **Includes**: Room & breakfast ₦411,428.58, Service charge 10% ₦41,142.87, VAT 7.5% ₦30,857.13, Lagos consumption tax 5% ₦20,571.42 (illustrative rates), and "Prices include taxes and service charge."
4. The reservation's Rate per night card shows each night's **Price** first (₦168,000.00), then what it includes.

## Acceptance criteria

### Main path
- Given a hotel with no plans, when the first-rate table creates Best available (and Bed & breakfast), then both have prices including taxes and service charge.
- Given the plan editor for a new plan, then "Prices include taxes and service charge" is on and More options is closed; given a plan priced before taxes, More options is open.
- Given `ratePlans.create` without `pricesIncludeTaxes`, then the plan is inclusive; the database default is inclusive too (migration 0023). Existing plans keep their setting.
- Given an inclusive plan, then its prices are labelled "incl. taxes and service charge" (rates screens, change dates, cell detail, Rooms base rate, tape chart, room move); an exclusive plan's say "excl. …" and carry the Excl. taxes badge (list) or "excl. taxes" (calendar row). Page headers over many plans say "incl. … unless marked excl." when the plans are mixed.
- Given an inclusive quote, then the booking summary leads with the total and lists Includes: room, each tax line, rounding when not ₦0.00; reservation detail and walk-in lead with the price; exclusive quotes keep room + taxes = total.
- Given an inclusive plan in the rates screens, then the figure under each price reads "Before taxes" (net plus any rounding); exclusive plans keep "Guest pays".
- Given the demo seed, then every plan is inclusive at the same figures as before (Best available, Bed & breakfast, Non-refundable and Acme's plans at all four hotels).

### Organization isolation
- Not changed: the overview's exclusive-plan count and the base plan's flag come from the same organization- and hotel-scoped queries.

### Property scoping
- Not changed: the flag is per plan, per hotel.

### Permissions, limits and approvals
- Not changed: only `rates.edit` sets a plan's basis. Discounts are still measured against the plan price, which on an inclusive plan is all-in.

### Audit events
- Not changed: `rate_plan.created` and `rate_plan.updated` already record `pricesIncludeTaxes` in before/after ("Prices include taxes" in Change history).

### Leakage exceptions
- Not relevant.

### Offline behaviour
- Not changed: an offline check-in or desk list shows the basis stored on the stay's terms.

### Business date
- Not changed.

### Tax lines
- An inclusive price is backed out with brick 3's tax function: net = price ÷ (1 + combined rate), lines rounded half-up, any leftover kobo on one rounding line that is part of net revenue. A stay's terms keep the basis it was sold on.

### Foreign currency
- Not changed: the equivalent is of the total, which on an inclusive plan is the price.

### Availability locking
- Not relevant.

### Empty, error and edge cases
- A hotel without taxes set up: the rates screens say "Set up taxes to see what guests pay" as before, and reservation detail says tax lines can't be shown; the price is still the all-in figure.
- A plan derived from an exclusive parent keeps its own flag; labels follow each plan.

## Out of scope
- Converting existing plans (a GM ticks the box per plan).
- A hotel-level or group-level switch.
- POS menu prices (Stage 3 decides its own basis; the bill preview in Finance already shows both).
- The legal check on price display (rate plans Open question 20) stays open.

## Docs to update
- `stage-1-rate-plans.md`: Open question 5 and Tax lines point here; UI copy reads "incl."
- `stage-1-plan.md`: brick 8b row.
- Walkthroughs: `guest-stay.md` figures, `going-live.md` first rate, `README.md` demo world wording.
- Help: setting up rates, taking a phone booking, setting up taxes.
- `CHANGELOG.md`.
