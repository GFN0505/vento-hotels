# Help centre

The in-app help centre and contextual help, written for hotel staff and guests (not developers). Articles live here as Markdown and are published into the app's help panel; articles under `guests/` are shown in the guest app.

## Rules
- Every shipped journey (`docs/journeys/`) gets an article here in the same change that ships it. The article follows the walkthrough's steps in the customer's words, with screenshots taken from the demo seed (Kora Hotels Group).
- Follow the `ux-writing` skill: plain English, the words in `docs/DOMAIN.md` as staff use them, no internal jargon, no field names.
- One task per article. Title starts with a verb: "Check in a walk-in guest", "Close your cashier shift", "Post a bill to a room".
- Say what works offline and what waits for the connection, where it matters.
- Say when an action needs a manager's approval or a reason, and who can give it.
- Each article ends with "Related" links to the next likely task.

## Structure
```
docs/help/
  getting-started/     sign in, PIN sign-in on shared devices, set up your group and properties, invite your team, import from another PMS or Excel
  front-desk/          arrivals, check-in and walk-ins, room moves, check-out, deposits, cashier shifts
  reservations/        new and group reservations, the tape chart, modify and cancel, no-shows
  rates-and-channels/  rate plans, restrictions, booking engine, channel manager, promo codes
  guests-and-sales/    guest profiles, corporate accounts, travel agents, group blocks, events, guest messages
  restaurant-and-bar/  outlets and menus, orders and tickets, post to room, split bills, voids and comps
  housekeeping/        room status board, assignments, room checks, inspections, minibar, lost and found
  maintenance/         work orders, out-of-order rooms, preventive schedules, power and diesel log
  inventory/           stores, requisitions, purchase orders, receiving, stock counts, recipes
  finance/             folios, payments, city ledger, reconciliation, foreign currency, taxes, ledger
  night-audit/         running the night audit, fixing what blocks it, the business date
  hr-and-payroll/      employees, rosters, attendance, payroll, service charge distribution, leave
  reports/             the report catalogue, exporting to PDF and Excel
  owner/               the owner's daily report, leakage alerts, group dashboards, board packs
  guests/              articles for guests, shown in the guest app
```

## Articles
| Article | Journey | Status |
|---|---|---|

Status: `todo` · `written` · `published`
