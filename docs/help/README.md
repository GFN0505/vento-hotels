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
| [Join your hotel group](getting-started/join-your-hotel-group.md) | going-live | written |
| [Invite your team](getting-started/invite-your-team.md) | going-live | written |
| [Change what a role can do](getting-started/change-what-a-role-can-do.md) | going-live | written |
| [Preview what each role sees](getting-started/preview-what-each-role-sees.md) | going-live | written |
| [Register a shared device](getting-started/register-a-shared-device.md) | going-live | written |
| [Sign in on a shared device with your PIN](getting-started/sign-in-on-a-shared-device.md) | going-live, front-desk-morning, room-attendant-shift | written |
| [Turn on two-step sign-in](getting-started/turn-on-two-step-sign-in.md) | going-live, owner-morning | written |
| [Switch between your hotels and the whole group](getting-started/switch-between-hotels.md) | owner-morning | written |
| [When the internet or power drops](getting-started/when-the-internet-drops.md) | waiter-dinner-service | written |
| [Set up your rooms](getting-started/set-up-rooms.md) | `going-live.md` step 3 | written |
| [Set up your rates](getting-started/set-up-rates.md) | `going-live.md` step 4 | written |
| [Add a hotel](getting-started/add-a-hotel.md) | `going-live.md` step 1b, "Later: opening Kora Lekki" | written |
| [Manage your companies](getting-started/manage-companies.md) | `going-live.md` step 1b | written |
| [Take a phone booking](reservations/take-a-phone-booking.md) | `front-desk-morning.md` step 6a | written |
| [Get a discount approved by a manager](reservations/get-a-discount-approved.md) | `front-desk-morning.md` step 6b | written |

Status: `todo` · `written` · `published`
