# Product

## Vision
The operating system for Nigerian hotel groups. One place to run every property end to end — selling rooms on the direct site and every OTA, checking guests in and out, charging the restaurant and bar to the room, turning rooms around, buying stock and diesel, paying staff, closing the day and the books — with the speed and polish of the best software in the world and none of the clutter of legacy PMS systems. It keeps working when NEPA takes the light or the internet drops.

## Principles
1. **Just what's required.** All ten modules ship, but each one only does what a hotel genuinely needs. Every option and setting must earn its place; prefer a great default.
2. **Effortless.** A new front desk agent checks in their first guest in under 5 minutes without training. Common tasks take ≤ 3 clicks or one ⌘K command. A walk-in check-in takes under 60 seconds.
3. **Fast everywhere, even offline.** Every interaction feels instant (< 100 ms), pages load in < 1 s on a mid-range Android phone on a weak connection. Front desk, POS and housekeeping keep working through power and internet cuts and sync when they're back.
4. **Money you can trust.** Every naira (or dollar) is traceable from charge to folio to settlement to ledger. Nothing on a folio is silently edited or deleted; voids, discounts and comps carry a reason and a name. Night audit closes the day cleanly.
5. **Built for Nigeria.** Bank transfer and POS terminals as first-class payments, Paystack for cards, NGN with USD/GBP/EUR guests, VAT plus state consumption tax and service charge, corporate accounts that pay late, generator and diesel costs, WhatsApp as the guest channel, guest registration for foreign nationals.
6. **One group, many properties.** A guest, a corporate account, a rate, a menu or a supplier is set up once and used across properties; the MD sees the whole group, a front desk agent sees only their hotel.
7. **Hard to cheat.** Every naira and every room night is accounted for. The system makes leakage visible to the owner the next morning, with names, without anyone having to dig.
8. **Connected, not siloed.** One record flows through every module: a booking from Booking.com becomes a reservation, the guest checks into a room, the restaurant charges the folio, housekeeping turns the room, night audit posts revenue to the ledger, and the executive dashboard sees all of it.

## Who it's for
Hotel **groups and chains** in Nigeria, from a 2-property group to large chains across states, and single independent hotels that want the same quality.

| Persona | Main jobs |
|---|---|
| **MD / group GM** | Occupancy, ADR, RevPAR across properties, cash position, outstanding corporate balances, board packs |
| **Hotel GM** | Today's arrivals and departures, house status, revenue vs budget, guest issues, staff on duty |
| **Revenue / reservations manager** | Rates and restrictions, channel availability, group blocks, forecasts, OTA commissions |
| **Front desk agent** | Check-in, check-out, walk-ins, room moves, deposits, folio settlement, guest requests |
| **Sales manager** | Corporate accounts and negotiated rates, groups, events and conference bookings |
| **F&B manager / cashier / waiter** | Orders, kitchen tickets, room charges, bills, table and outlet takings |
| **Housekeeping supervisor / room attendant** | Room status board, assignments, inspections, lost and found, minibar, from a phone |
| **Maintenance / engineering** | Work orders, out-of-order rooms, generators and diesel, preventive maintenance |
| **Storekeeper / procurement** | Stock levels, requisitions, purchase orders, receiving, stock counts |
| **Finance & accounts** | Night audit, city ledger, cashier shifts, bank and POS reconciliation, ledger per entity, VAT and consumption tax, payroll |
| **HR / admin** | Staff across properties, rosters and shifts, payroll, leave |
| **Guest** (guest app) | Book direct, pre-check-in, digital key details, requests, view and pay folio |

## The ten modules (all in v1)

### 1. Reservations & Front Desk
Property setup (room types, rooms, floors, amenities), reservations (individual and group), availability calendar and tape chart, rate plans with seasons and restrictions (min stay, closed to arrival), deposits and guarantees, check-in with guest registration (including foreign national details), room assignment and moves, early check-in and late check-out, check-out with folio settlement, cashier shifts, night audit.
*Lean choices:* one tape chart that does drag-to-move and drag-to-extend instead of separate screens; no key-card encoder integrations in v1 beyond recording the key issued.

### 2. Booking Engine & Channel Manager
A fast, mobile-first direct booking site per property (and a group site), Paystack card and transfer payment, promo codes. Two-way sync of availability, rates and reservations with OTAs (Booking.com, Expedia, Airbnb, Hotels.ng and similar) through one channel-manager provider, rate parity view, OTA commission tracking.
*Lean choices:* we connect through one certified channel-manager provider rather than building direct connections to each OTA.

### 3. Guests & Sales
Guest profiles shared across the group (stay history, preferences, notes, blacklist), corporate accounts with negotiated rates and credit limits, travel agents, group blocks with pick-up and release dates, events and conference bookings (halls, packages, banquet event orders), guest messages over WhatsApp, SMS and email (confirmation, pre-arrival, post-stay review request).
*Lean choices:* a simple repeat-guest recognition and notes instead of a points loyalty programme in v1.

### 4. Restaurant & Bar POS
Outlets per property (restaurant, bar, pool bar, room service), menus with modifiers and prices per outlet, table and tab orders, kitchen and bar tickets (printer or screen), post to room folio with guest verification, split and merge bills, payments (cash, transfer, POS terminal, card), cashier sessions, voids and comps with reasons, recipes that deduct stock. Works offline on a tablet or phone.

### 5. Housekeeping & Maintenance
Room status board (`clean`, `dirty`, `inspected`, `out_of_order`, `out_of_service`) linked to front desk, daily assignment of rooms to attendants, mobile checklist and inspection, minibar posting, laundry, lost and found, maintenance requests and work orders, out-of-order rooms removed from inventory, preventive schedules for generators, AC, lifts, pumps, and a diesel and power log.

### 6. Inventory & Procurement
Stores per property (main store, kitchen, bar, housekeeping, engineering), items with units and par levels, requisitions from departments, purchase orders and receiving against suppliers, transfers between stores and properties, stock counts with variance, recipe costing for F&B, diesel stock.
*Lean choices:* average cost valuation only; no barcode hardware integration in v1 beyond camera scanning on phones.

### 7. Finance
Folios and the city ledger (corporate and travel agent receivables, ageing, statements, invoices), payment methods and reconciliation (bank transfer, POS terminal settlement, Paystack), night audit that posts room and tax charges and closes the business date, general ledger with multiple legal entities and properties, multi-currency (NGN base; USD, GBP, EUR) with FX rates (CBN official rate, flag for market rate used), expenses and supplier payables, taxes (VAT, state consumption tax, service charge, WHT, CIT, PAYE remittance), budgets vs actual per property and department (USALI-style departments).

### 8. HR & Payroll
Employees across properties and entities, departments, rosters and shifts, attendance, casual staff on daily rates, Nigerian payroll (PAYE, pension under PenCom, NHF, NSITF, ITF), service charge distribution to staff where the property shares it, payslips, leave, staff meals and uniforms where tracked.

### 9. Guest App
A light, mobile-first web app (no install) from the booking confirmation link: manage booking, pre-check-in with ID upload, arrival time, room-ready notification, requests (towels, maintenance, late check-out), restaurant menu and order to room, live folio and pay online, invoice download, review request after stay.

### 10. Executive Analytics
Real-time dashboards across properties: occupancy, ADR, RevPAR, TRevPAR, GOPPAR, revenue by department and channel, pace and pick-up, OTA commissions, F&B covers and average check, cost of sales, payroll %, diesel cost per occupied room, city ledger ageing, cash by entity, budget variance. Board-ready report packs (PDF).

## Cross-cutting (part of v1, not separate modules)

### Leakage & fraud controls
Revenue leakage — rooms sold off the books, unrecorded walk-ins, unapproved discounts, voided bills, cash that never reaches the bank — is the owner's biggest fear and our strongest reason to buy. Controls are built into every module, not bolted on:
- **Room discrepancy check:** housekeeping's physical status (occupied / vacant, from the attendant's phone) is compared with the front desk's status several times a day. Mismatches ("sleeper": system occupied, room empty; "skipper": system vacant, room used) alert the GM at once.
- **Short-stay and quick-turn flags:** day uses, rooms checked out within hours, rooms re-made without a checkout, early checkouts with refunds.
- **Rate integrity:** every stay sold below the rate plan, every override, discount, comp and void, by staff member, with reason and approver; limits per role from the permissions matrix.
- **Cash integrity:** blind cash counts at shift close, variances by cashier, transfers and POS payments matched to bank and terminal settlements, unmatched items aged.
- **POS integrity:** voids after a ticket was sent, comps, bills reprinted, bills left open past closing, stock variance against recipes.
- **Owner's daily report:** a one-page summary sent on WhatsApp and email every morning after night audit — occupancy, revenue, cash collected, and every exception above with names. Readable in 30 seconds.

### Hardware & printing
Front desk A4 printing (registration card, invoice, folio), 80mm thermal receipts and kitchen/bar tickets, cash drawers, and ID scanning with the phone or tablet camera. Shared POS and housekeeping devices use fast **PIN sign-in** with automatic sign-out; each device is registered to a property and can be revoked.
*Lean choices:* no key-card encoder integration in v1; printers through the browser and a small optional print bridge for network kitchen printers.

### Getting onto Vento
Every customer is moving from another PMS or from Excel. Import from CSV/Excel templates (and known PMS exports where possible): rooms and room types, guests, corporate accounts, future reservations with deposits, city ledger opening balances, stock items and opening stock, employees, and ledger opening balances per entity. Every import has a preview, validation errors by row, and an undo within 24 hours.

### Reports
A small, fixed catalogue that every hotel needs, all exportable to PDF and Excel: manager's flash report, owner's daily report, arrivals, departures and in-house lists, guest register (incl. foreign nationals, for authorities), room status and discrepancy report, cashier/shift report, revenue by department and payment method, deposits held, city ledger ageing, no-shows and cancellations, rate override and discount report, POS sales and voids, stock and variance, tax report (VAT, consumption tax, service charge). No report builder in v1.

### Running Vento as a business
Our own subscription billing of customers (plans by property and rooms, trial, invoices in NGN), a support console where staff can view a customer's account only with the customer's time-limited consent (logged), status page, daily backups with tested restores, and a seeded demo group for sales and tests.

## How modules connect
```
Booking engine / OTA / phone ──▶ Reservation ──▶ Check-in ──▶ Folio ◀── POS charges, minibar, laundry, events
        ▲                             │               │          │
  Rates & availability          Guest profile   Room status   Settlement ──▶ Cash / bank / POS / city ledger
  (channel manager)             Corporate acct  (housekeeping)     │
                                                      │       Night audit ──▶ Ledger (per entity) ──▶ Analytics
  Stores ◀── Purchase orders ◀── Requisitions ◀── Recipes (POS)   │
  Payroll (rosters, service charge) ─────────────────────────────┘
```

## Quality bar
- Benchmarks for craft: Linear, Stripe Dashboard, Mercury, Ramp, Mews.
- Keyboard-first for front desk and back office (⌘K, shortcuts); touch-first and offline-tolerant for POS, housekeeping and maintenance on phones and tablets.
- Every screen has designed loading, empty, error, offline and success states.
- WCAG 2.2 AA in light and dark mode.
- Tax rates, service charge, levies, statutory deductions and regulatory rules are **configuration with effective dates**, never hard-coded, and must be checked against current law (Nigeria's 2025 tax reform acts take effect from 2026; consumption tax is set by each state).
- Reliability: 99.9% monthly uptime for the API; no data lost on a device that goes offline; restore from backup tested monthly.

## Release plan
All ten modules are in v1, built in stages. Each stage ends usable by a real pilot hotel on its own, with leakage controls and reports for what it covers.

| Stage | Scope | A pilot hotel can… |
|---|---|---|
| **0. Foundation** | Monorepo, auth with organizations, properties and entities, permissions matrix, audit events, app shell with a role-shaped Home and an All hotels view, offline shell, PIN sign-in, demo seed, CI | sign in, set up a group and properties |
| **1. Front office** | Room types and rooms, rate plans (manual), reservations, tape chart, check-in/out, walk-in, folios, payments, cashier shifts, corporate accounts with credit limits and settle-to-company (city ledger balances and statements), night audit, guest register, core reports, owner's daily report, data import | run the front desk without its old PMS |
| **2. Housekeeping & maintenance** | Room status board, attendant app, inspections, discrepancy check, work orders, OOO, power and diesel log | run rooms and catch sleepers/skippers |
| **3. Restaurant & bar** | Outlets, menus, POS offline, kitchen tickets, post to room, voids/comps controls | run F&B and charge rooms |
| **4. Distribution & guests** | Booking engine, channel manager, restrictions, guest profiles, corporates, group blocks, events, guest messages, guest app | sell direct and on OTAs, manage corporates |
| **5. Back office** | City ledger invoicing, ageing and collections, ledger per entity, reconciliation, taxes, inventory and procurement, recipes, HR and payroll | close the books and pay staff |
| **6. Group & analytics** | Group dashboards, KPIs, budgets, board pack, subscription billing, support console | run the whole group from one screen |

Specs for each stage live in `docs/specs/`, written by the product-manager before the stage starts.
