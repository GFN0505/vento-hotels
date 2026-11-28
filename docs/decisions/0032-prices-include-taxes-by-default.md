# 0032 · Rate plan prices include taxes and service charge by default

- **Date:** 2026-11-28
- **Status:** accepted
- **Supersedes:** the exclusive default in [stage-1-rate-plans.md](../specs/stage-1-rate-plans.md), Open question 5 and the "Tax lines" rule "Prices are exclusive … by default"

## Context
Brick 2 made rate plan prices exclusive of VAT, consumption tax and service charge by default, labelled "excl. taxes and service charge" everywhere, with a per-plan "Prices include taxes and service charge" option that nobody in the demo used. Brick 3's tax function already backs the taxes out of an inclusive price and keeps any leftover kobo on one rounding line. On 28 Nov 2026 the owner said most Nigerian hotels quote one all-in price: the guest hears ₦168,000 a night and that is what the bill comes to. An exclusive default makes the front desk add 22.5% in their heads, makes every quote sound higher than the hotel's price list, and is the opposite of what pilot hotels type in. Spec: [stage-1-tax-inclusive-default.md](../specs/stage-1-tax-inclusive-default.md).

## Decision
- A new rate plan's prices **include** taxes and service charge unless whoever sets it up turns that off. This covers the first-rate table (Best available and Bed & breakfast), the plan editor, the API contract default and the database column default (migration 0024).
- **Existing plans keep their setting.** Nothing is converted: a plan's basis is a term of the plan, and stays already booked keep the terms they were sold on.
- Exclusive stays a per-plan choice under **More options**, which opens by itself on a plan priced before taxes, so the exception is never hidden.
- **Labels follow the plan.** A price for one plan says "incl. taxes and service charge" or "excl. taxes and service charge". A page over many plans (Rate plans, Rate calendar) says "incl. taxes and service charge" when all are inclusive, "excl. …" when all are exclusive, and "incl. … unless marked excl." when mixed; a plan priced before taxes carries an **Excl. taxes** badge (the list) or "excl. taxes" (the calendar row). The Rooms page's Base rate column and the tape chart's tonight price follow the base plan.
- **Totals put the taxes inside the price** on an inclusive plan: the booking summary leads with the total and lists "Includes" room, each tax line and any rounding beneath; reservation detail shows each night's price first, then what it includes; the walk-in bar leads with the total. Exclusive plans keep "room + taxes = total".
- "Guest pays" beside a price in the rates screens becomes **Before taxes** on an inclusive plan: what the hotel keeps once the taxes inside are taken out (net plus any rounding kobo, which are the hotel's revenue as on the bill).
- The demo's prices are now all-in at the same figures (Kora Victoria Island's Deluxe King ₦150,000, Bed & breakfast ₦168,000 a night including everything).

## Consequences
- Quotes, confirmations and the bill agree with the price list the hotel already prints; the front desk never adds taxes in their head.
- Tax lines on an inclusive price are smaller than the same figure exclusive (₦30,857.14 inside ₦168,000 rather than ₦37,800 on top), so the demo's revenue and tax figures change; the walkthroughs and help say the new figures.
- Night audit (brick 13) posts the stored all-in nightly price and splits it with the same tax function; nothing about posting changes.
- Settles the display half of rate plans Open question 20 (FCCPC price display) in the guest's favour: the price shown is the price paid. The legal check itself stays open.
- A demo database seeded before this change still has exclusive plans; reseed to see the all-in demo.

## Alternatives considered
- **Keep exclusive and add a hotel-level switch:** a second place to look for the same answer, and the default would still be wrong for most hotels.
- **Convert existing plans to inclusive:** changes prices hotels set on purpose and the terms of stays already sold; a GM who wants it ticks the box per plan.
- **Gross up the demo prices (₦150,000 → ₦183,750 all-in):** keeps the old tax figures, but no Lagos hotel quotes ₦183,750; round all-in prices are the point.
