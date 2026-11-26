# Stage 1 plan: front office

- **Status:** approved (owner, 2026-11-26)
- **Goal (from `docs/PRODUCT.md`):** a pilot hotel runs its front desk without its old PMS: rooms, manual rates, reservations, tape chart, check-in/out, walk-ins, folios, payments, cashier shifts, corporate accounts with credit limits and settle-to-company, night audit, guest register, core reports, owner's daily report, data import.
- **Rule:** one brick = one spec = one pull request, in this order, each ending usable and tested on the demo seed. Everything sits behind the `front_desk` switch (decision 0021); the pilot gets it when brick 17 lands.

| # | Brick | Afterwards a person can… | Designs | Main risks | Lead |
|---|---|---|---|---|---|
| 0 | Hotels and companies ([spec](stage-1-hotels-and-companies.md)) | complete the hotel and company onboarding left bare, add, archive and restore hotels and companies, and let a GM change check-in and check-out times; finishes Stage 0's "set up a group and its hotels" | #25 SetProperty, SetEntities | first upload to object storage; no hotel without a company, no company archived while it owns one | backend + frontend |
| 1 | Room types and rooms ([spec](stage-1-room-types-and-rooms.md)) | set up 120 rooms in minutes with "Add rooms by floor" | #33, #19 rooms step, OnbHome | room count must never be typed; GM needs a new permission ⚑ | backend |
| 2 | Rate plans and rates (manual) | create BAR, B&B, Non-refundable (BAR − 10%) and Corporate with seasons, meal plan, cancellation and deposit rules | #33 plan editor, #19 first rate | derived-plan maths in decimals; breakfast split between rooms and food ⚑ | distribution |
| 3 | Taxes, service charge, payment methods, FX rates | see VAT, Lagos consumption tax and service charge from versioned rules, set payment methods and today's CBN rate | #27, FX pattern | seed rates must be verified against the 2025 tax acts ⚑; foreign-currency settlement ⚑ | finance |
| 4 | Availability and new reservations | book a room type for dates with live "3 left", find and open reservations | #4, #5, reservations list | per-date row locks and the last-room concurrency test; overbooking limit 0 | backend |
| 5 | Approvals | get a GM's PIN on the same screen, or an approval in the inbox, for an over-limit discount | #22 approval prompt, #29 | nobody approves their own action; limits re-checked on the server | backend |
| 6 | Modify, cancel and no-show policy | change dates or type, cancel with the policy's penalty or a waiver | #31 modify/cancel | availability re-locked on every change; penalty waiver permission | backend |
| 7 | Tape chart, room moves and room status | see the house, drag to move or extend, mark rooms clean/dirty, put a room out of order with dates | #3, #31 room move | OOO changes inventory under the same lock; minimal room status pulled into Stage 1 ⚑ | frontend |
| 8 | Front desk lists, check-in, walk-in, registration | check in an arrival with ID/passport and do a walk-in in under 60 s | #30, #6, #21 registration card | encrypted, masked ID numbers (NDPA); legal registration fields ⚑; front desk PC shared or personal ⚑ | frontend |
| 9 | Cashier shifts | open a shift with a float and close it with a blind count | #34 open/close | count can't be edited after submit; variance needs a reason | payments |
| 10 | Folios, payments, deposits, check-out | post charges, take cash/transfer/POS/card, hold deposits, split folios, settle and check out | #7, #31 post/pay/refund/transfer, #34 deposits held | append-only postings and tax lines; refund limits; key before a transfer is matched ⚑ | payments |
| 11 | Payment matching queue | match transfers and POS terminal payments to bank and terminal lines, see unmatched items ageing | #34 matching | statement import vs provider API ⚑ | payments |
| 12 | Corporate accounts and city ledger | set Acme's credit limit and rate, route room charges, settle to company, print a statement | #10 corporate, #21 statement | credit check inside the settlement transaction; does it count open routed charges ⚑; invoice PDF vs e-invoicing ⚑ | payments (+ finance) |
| 13 | Night audit | close the day: checks, no-shows, room and tax charges, roll the business date | #15 | idempotent re-runs; exactly one room charge per stay per date | finance |
| 14 | Group reservations and rooming list | book 10 rooms for a wedding, add names later, one master folio | #32 | first candidate to slip if Stage 1 runs long | backend |
| 15 | Guest register and core reports | export the guest register for authorities; flash, arrivals/departures/in-house, shift, revenue, deposits held, ageing, no-shows, discounts | #35 report viewer, register | every register export logged with a reason | finance |
| 16 | Owner's daily report and leakage view | get the morning summary with exceptions and names | #20 | WhatsApp provider not chosen: email first ⚑ | finance |
| 17 | Data import | bring rooms, guests, companies, future reservations with deposits and city ledger opening balances from Excel or the old PMS, with undo | #23, #41 duplicates | imports go through the same services and locks; legacy formats and rate plan import ⚑ | backend |

**Order notes.** 1–3 are setup and unblock everything that prices or counts rooms. 4 before 5: discounts within the limit work in 4, over-limit ones wait for 5. 9 before 10 so payments always land on an open shift. 13 needs 10 and 12. 15–16 read frozen night-audit data, so they follow 13. Import is last because it reuses every service before it; until then hotels use the builders.

**Stage 1 is done when** `front-desk-morning`, `night-audit`, `owner-morning` and `going-live` pass their Stage 1 steps, and golden-thread hops 1, 4, 8 and 9 pass. Room status board, discrepancy checks and work orders stay in Stage 2; the rates grid, channels and guest profiles beyond what check-in needs stay in Stage 4.

## ⚑ Owner decisions (from `docs/DOMAIN.md` and walkthrough open questions)
- **Brick 1 (decided 2026-11-26):** GMs set up rooms with a new `rooms.setup` permission.
- **Brick 7 (decided 2026-11-26):** minimal room status (clean or dirty, out of order with dates and reason) is in Stage 1.
- **Brick 3 and 10:** finance or legal confirms VAT and Lagos consumption tax under the 2025 acts before the pilot; and whether foreign guests settle in USD at the desk or in NGN at a set rate.
- **Brick 12:** Stage 1 city ledger = balances, credit limit and statements only, with invoices (and any e-invoicing) in Stage 5? And does the credit check count charges already routed to the company on open folios?
- **Brick 16:** owner's daily report by email first, WhatsApp once a provider is chosen.
- Also needed before their bricks: is the front desk PC a shared PIN device (8); can keys be issued before a transfer is matched (10); POS terminal providers and matching method (11); the go-live business date and opening balances as-of date (13, 17); rate plan import and first legacy PMS format (17).

**Demo-world conflicts to settle in the bricks that seed them:** the Okoro family (4 guests) in a 2-guest Standard Queen (brick 2/8); 25 Nov out-of-order rooms are 305 and 406 in the designs but only 503 in the walkthroughs ("85 of 119") (brick 7).
