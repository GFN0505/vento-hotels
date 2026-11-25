# Claude Design prompt

Paste everything below the line into Claude Design. It's long on purpose: one consistent system across ten modules. Don't ask for all 23 screens at once, or the output gets thin. Work in three rounds in the same project:

1. **Round 1, system and front office:** paste the whole prompt, then ask for *the design system page and screens 1–7, 20 and 21*. Review it and fix the foundations (type, density, colours, tape chart) before going on.
2. **Round 2, operations and guest-facing:** "Using the same design system, design screens 9, 11, 12, 13, 17 and 22."
3. **Round 3, back office and group:** "Using the same design system, design screens 8, 10, 14, 15, 16, 18, 19 and 23."

---

Design **Vento Hotels**, a hotel management platform for Nigerian hotel groups and chains. Web app: keyboard-first on desktop for front desk and back office, touch-first on tablets and phones for POS, housekeeping and maintenance, responsive throughout. It runs the whole hotel group: direct booking site and OTAs → reservations and front desk → folios charged by the restaurant, bar, minibar and events → housekeeping and maintenance → stores and purchasing → night audit and finance across properties and legal entities, plus HR and payroll, a guest app and executive analytics.

The bar is world-class: the craft and calm of Linear, Stripe Dashboard, Mercury, Ramp and Mews. Ten modules, but **no clutter**: every element must help someone decide or act. A new front desk agent should check in their first guest in under 5 minutes without training; a walk-in takes under 60 seconds.

## Users
- **MD / group GM:** occupancy, ADR and RevPAR across properties, cash by entity, outstanding corporate balances, board packs.
- **Hotel GM:** today's arrivals and departures, house status, revenue vs budget, guest issues, staff on duty.
- **Revenue / reservations manager:** rates and restrictions, channel availability and parity, group blocks, pace and pick-up, OTA commissions.
- **Front desk agent:** check-in, check-out, walk-ins, room moves, deposits, folio settlement, guest requests.
- **Sales manager:** corporate accounts and negotiated rates, group blocks, events and conferences.
- **F&B manager, cashier, waiter (on a tablet or phone):** orders, kitchen tickets, room charges, bills, outlet takings.
- **Housekeeping supervisor and room attendant (on a phone):** room status, assignments, inspections, minibar, lost and found.
- **Maintenance, storekeeper, finance, HR**, and **guests** in their own app.

## Nigerian context the design must handle naturally
- **Power and internet cuts** are routine. Front desk, POS and housekeeping keep working offline and sync later; the user must always know what is saved locally and what has synced.
- Payments: bank transfer and POS terminals (Moniepoint, OPay, bank terminals) are first-class, each with a reference for reconciliation; Paystack for cards; cash with a cashier float.
- Taxes on every bill: **VAT**, **state consumption tax** (e.g. Lagos) and the hotel's **service charge**, always shown as separate lines with the total. Prices can be inclusive or exclusive; say which.
- Guests pay in NGN, USD, GBP or EUR: show the original amount and the ₦ equivalent with the FX rate and its source (CBN official, or market rate flagged).
- **Corporate accounts** pay on credit and often late: city ledger, credit limits, ageing 0–30 / 31–60 / 61–90 / 90+.
- **Foreign national registration** is a legal requirement: passport number, nationality, visa or permit, arriving from, next destination. ID numbers are masked in the UI (NDPA 2023).
- One group, many properties, often several legal entities; a guest, corporate, rate or supplier is set up once and used everywhere.
- Generators and diesel are a real cost line (diesel cost per occupied room).
- WhatsApp is the main guest channel for confirmations, receipts and requests.
- Dates as `25 Nov 2026`, stays as `25–28 Nov 2026 · 3 nights`, money as `₦125,000.00` and `$85.00`, phones as `+234…` and foreign. Locations: area, LGA, state (e.g. Victoria Island, Eti-Osa, Lagos).

## Brand and visual direction
- Primary **#7677FB** (violet). Deep navy sidebar. Light neutral background, white cards, full dark mode.
- Font: Poppins, or propose a better sans for dense grids and financial tables, with reasoning. Tabular numbers for all money, room numbers and counts.
- Soft 10px radius, subtle borders over heavy shadows, generous whitespace, restrained colour: colour means status or action, never decoration.
- Status colours: emerald = clean/inspected/paid/settled, amber = dirty/due/pending/tentative, blue = occupied/in progress/checked in, rose = out of order/overdue/no-show/blacklisted, slate = draft/inactive/cancelled. Out of service is a muted rose or striped variant of out of order. Keep the same meaning in every module.
- Room and property photos used with purpose (booking engine, room types, guest app), never as filler in the back office.

## Global patterns
- **App shell:** sidebar grouped by module with icons (collapsible); top bar with ⌘K search, **property switcher** (one property, several, or the whole group), **entity switcher** in finance, the property's **business date** (clearly distinct from today's calendar date after midnight), notifications and user menu. Mobile: bottom navigation for the 4 most-used destinations for that role, plus "More".
- **Offline:** a quiet connection indicator in the top bar; when offline, a banner and a **sync queue** (pending actions with count, last synced time, conflicts to resolve) on front desk, POS and housekeeping. Actions taken offline show a "saved on this device" state until synced.
- **⌘K command palette:** jump to any guest, reservation, room, folio, company or check; run actions ("New reservation", "Walk-in", "Check in 214", "Post charge", "Room move", "Open shift").
- **Lists:** one consistent table (search, filter pills, saved views, column picker, bulk actions, pagination), with card view on mobile.
- **Detail pages:** header with key facts and status, then tabs; right-side activity timeline.
- **Forms:** side sheets for edits, stepped sheets for flows; smart defaults; inline validation.
- **Sensitive actions** (rate override, discount, void, refund, comp, room move after audit) ask for a reason in the same dialog, and show who did it in the timeline. Above the user's limit, the same dialog asks for a manager's PIN or approval instead of failing.
- **Feedback:** toasts with undo for reversible actions; confirmation only for money, approvals and deletions, and the button states the exact effect ("Settle ₦412,500.00 to Acme Energy Ltd").
- **States:** every screen has skeleton loading, a helpful empty state with one action, error with retry, and offline status.

## Screens (desktop 1440px and mobile 390px, light and dark)
1. **Group executive home:** occupancy, ADR and RevPAR today and month to date by property, revenue by department and channel, pace vs last year, city ledger ageing, cash by entity, budget variance, diesel cost per occupied room, and a "Needs attention" list (properties below forecast, corporates over credit limit, licences expiring, unbalanced shifts) with one-click actions.
2. **Property GM home (today):** arrivals, departures and in-house counts with lists, house status (clean, dirty, inspected, OOO, OOS), occupancy and revenue vs budget, VIPs and special requests, staff on duty, and "Needs attention" (unassigned arrivals, rooms not ready, balances due on departure, open work orders).
3. **Tape chart / availability calendar:** rooms by type down the side, dates across, reservation bars coloured by status; drag to move room, drag the edge to extend or shorten, with a confirm showing the rate impact; availability row per room type; OOO blocks; today and business date marked.
4. **New reservation flow (stepped sheet):** dates and guests (nights count) → room type and rate plan (availability and restrictions visible, live total with VAT, consumption tax and service charge broken out) → guest (search or add, company or travel agent) → guarantee and deposit (transfer, POS, Paystack link) → review and send confirmation (WhatsApp or email). The total, deposit due and cancellation policy are always visible.
5. **Reservation detail:** stays and rooms, guest and company, rate breakdown per night, guarantee and deposit, routing, messages sent, history; actions (check in, modify, room move, cancel with policy penalty, no-show).
6. **Check-in flow:** verify ID (scan or upload, masked number), registration card with foreign national fields when nationality isn't Nigerian, room assignment (ready rooms first, with status), deposit or authorisation, key issued. Plus a **60-second walk-in**: one screen, room type → rate → guest → payment → key.
7. **Folio and check-out:** postings by business date with department and tax lines, multiple folios per stay with routing (room and breakfast to company, extras to guest), post charge, void with reason, split payment across methods and currencies, settle to city ledger with credit limit check, then invoice or receipt as PDF and ready to send on WhatsApp.
8. **Rates and restrictions:** a grid of room types × rate plans × dates, editable cells for rate, min stay, closed, CTA, CTD, bulk edit by date range and weekday, derived plans shown as linked. **Channel manager:** channel connection and last sync status, mapping, sync errors, rate parity across channels, OTA commissions.
9. **Booking engine (public, mobile-first, separate light brand surface using the hotel's own logo and photos):** dates and guests, room types with photos and the best rate, rate plan options, guest details, Paystack payment or transfer, confirmation. Totals always show taxes and service charge.
10. **Guests and sales:** guest profile (stay history, preferences, notes, VIP, blacklist with reason), corporate accounts (negotiated rates, credit limit and balance, contacts), group blocks with pick-up vs release date, events calendar by space and BEO detail (pax, package per head, timings, charges to folio).
11. **POS on tablet:** table map by outlet, order screen with large item buttons by category, modifiers, covers, send to kitchen or bar, split and merge bills, payment (cash, transfer, POS terminal, card), post to room with guest name or PIN check; voids and comps with reason. Plus a **kitchen display** with ticket timers and bump.
12. **Housekeeping board and attendant view:** board of all rooms by floor with status, occupancy and attendant, filters, bulk assign; mobile attendant view with my rooms in order, start/done, checklist, minibar posting, report a fault, lost and found with photo. Supervisor inspection pass/fail with notes.
13. **Maintenance:** work orders board (open, assigned, in progress, resolved), put room OOO with dates, asset list with preventive schedule, and a **power and diesel log** (grid, generator and solar hours, diesel added and used, cost).
14. **Inventory:** stores and stock levels against par, requisitions approval, purchase orders and receiving (partial receipts), transfers, stock count with variance and reason, recipe cost and food cost %.
15. **Finance:** **night audit wizard** (checks with fix links: arrivals not checked in, departures not checked out, open POS checks, unbalanced shifts → no-shows → post room and tax → reports → roll business date), **cashier shift close** (float, takings by method, expected vs counted, variance reason), **city ledger** ageing and statements, **ledger per entity** and journal entries, payment reconciliation (transfer, POS terminal, Paystack), **tax summary** (VAT, consumption tax by state, service charge, WHT, PAYE).
16. **HR and payroll:** employees across properties, roster by department and shift, payroll run review (gross → PAYE, pension, NHF, NSITF, ITF → net, by entity, with service charge share) with clear totals before approval, payslip.
17. **Guest app (mobile web, no install, light brand surface):** manage booking, pre-check-in with ID upload and arrival time, room-ready notice, requests (towels, maintenance, late check-out), order food to the room, live folio, pay online, invoice download, review request after the stay.
18. **Board pack:** a printable, beautiful multi-page report (summary, occupancy/ADR/RevPAR by property, revenue by department, F&B, costs and payroll %, diesel, city ledger, cash, risks).
19. **Onboarding:** create organization → add property → room types and rooms (bulk by floor) → first rate → first booking, in under 5 minutes, with a setup checklist on home.
20. **Owner's daily report and leakage view:** the one-page morning report as it arrives on WhatsApp (image or PDF) and email — occupancy, revenue, cash collected, then exceptions with staff names (rates below plan, discounts, voids, comps, refunds, quick turns, cash variances, room discrepancies). In the app, a **Leakage** screen: exceptions by type and by staff member over time, each drilling down to the audit trail (who, device, reason, approver). Room discrepancies (sleeper / skipper) open as alerts that must be resolved with a reason. This is the owner's reason to buy: calm, factual, never accusatory.
21. **Printed documents:** A4 registration card (with foreign national section and guest signature box), A4 invoice / folio with tax lines and bank details, 80mm thermal receipt, 80mm kitchen/bar ticket (large item text, modifiers, table, time, server), and a city ledger statement. Designed for black-and-white printing.
22. **Shared device sign-in:** POS tablet and housekeeping phone lock screen with staff avatars and a PIN pad, auto sign-out, quick user switch mid-shift, manager PIN approval for an over-limit action (e.g. a discount above the waiter's limit) on the same device, and device registration for a property.
23. **Data import:** pick what to import (rooms, guests, corporates, future reservations, opening balances, stock, employees), download template, upload, row-by-row validation errors, preview, apply, and undo within 24 hours.

## Deliverables
- The screens above, consistent with each other.
- A design system page: colour tokens (light and dark), type scale, spacing, buttons, inputs, money input with currency, FX rate field, date range picker with nights count, status badges, table, **room status tile**, **tape chart bar**, **rate grid cell**, **folio line** (with tax lines and void state), **POS item button**, **PIN pad**, **exception row** (type, amount, staff, reason, approver), **approval prompt**, print layouts (A4 and 80mm), stat card, stepper, timeline, empty state, toast, offline banner and sync queue, command palette, property and entity switchers, sidebar and mobile nav.
- Short notes on any UX decision that isn't obvious.

Keep it lean: if an element doesn't help a user decide or act, leave it out.
