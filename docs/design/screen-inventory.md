# Screen inventory

Every screen and working dialog the product needs, checked against `claude-design-prompt.md` (46 screens in six rounds).

**Design status (25 Nov 2026):** all 46 screens are designed in Claude Design, with dark, 390px and loading/empty/error/offline variants. The export is in `export/`. Rows marked `pattern` have no board of their own and are built from the design system. Keep this up to date as screens are designed, built or changed.

**Status:** `designed #n` = screen n in the design prompt · `partial #n` = covered in part · `missing` = not in the prompt yet · `pattern` = built from the design system without its own design.
**Stage** follows the release plan in `docs/PRODUCT.md`.

## 0. Foundation, settings and admin
Covered by round 4 of the design prompt (screens 24–29).

| Screen | Status | Stage | Notes |
|---|---|---|---|
| Sign in, 2FA, forgot password, accept invite | designed #24 · **sign in, forgot and reset password built (brick 7); accept invite built (brick 8); two-step code at sign-in built (brick 12)** | 0 | Includes "no property assigned" and "device not registered" states. Both built: "device not registered" on the lock screen (brick 10), "no property assigned" on Home (brick 7) |
| Shared-device PIN sign-in, approval prompt | designed #22 · **PIN sign-in and lock screen built (brick 10)** | 0 | Approval prompt in Stage 1 (with the first action that needs it); offline PIN sign-in ships with the outbox (decision 0024) |
| Onboarding and setup checklist | designed #19 · **first steps and Home checklist built (bricks 7, 13)** | 0 | Built: create account, confirm email, group + company + first hotel; Home's "Finish setting up" with the Stage 0 steps. Rooms, rates and first booking steps come with Stage 1 |
| Properties list and property settings | designed #25 | 0 | Logo, address, time zone, check-in/out times, business date, owning entity |
| Entities and departments | designed #25 | 0 | RC number, TIN, VAT status |
| Members and roles | designed #25 · **built (brick 8)** | 0 | Invite, assign roles, limit to properties. PIN-only staff, 2FA and entity limits still to build |
| **Permissions matrix and limits editor** | designed #26 · **built (brick 8)** | 0 | Roles × actions grid with limits; owner only; every change audited. Effective dates, approvers and export still to build |
| Devices | designed #25 · **built (brick 10)** | 0 | Register, name, bind to property, revoke |
| **Audit log viewer** | designed #28 | 0 | Filter by staff, action, property, date; before/after diff; also a drawer on every record |
| Notifications centre | designed #29 | 0 | Bell menu + full list; what each role is alerted about |
| My profile and preferences | pattern · **account menu built (bricks 10–12)** | 0 | Password, 2FA, PIN reset, theme. Built in the account menu: set your staff PIN, two-step sign-in, Appearance (light, dark or system). A profile page (name, password) still to build |
| Global search results (beyond ⌘K) | pattern | 0 | |
| Error pages: 404, no access, offline first load, session expired | designed #24 · **offline banner and offline reopen built (brick 16)** | 0 | Built: the app reopens offline with what was saved and an offline banner; 404 built earlier. A first visit with no connection still shows the browser's own page |
| Mobile "More" menu per role | partial (global patterns) | 0 | |
| Sync queue and conflict resolution | designed #36 | 0 | Needs a real screen: what failed, why, retry or discard |

## 1. Reservations & front desk
| Screen | Status | Stage | Notes |
|---|---|---|---|
| Property GM home | designed #2 · **shape built (brick 15)** | 1 | Built: Home for one hotel, shaped by role (GM, front desk, housekeeping, restaurant, finance and the rest): figures that say which module brings them, quick actions, the hotel, Needs attention. Arrivals list, house status, VIPs and staff on duty come with Stage 1 data |
| Tape chart | designed #3 | 1 | |
| New reservation | designed #4 | 1 | |
| Reservation detail | designed #5 | 1 | |
| Check-in and walk-in | designed #6 | 1 | |
| Folio and check-out | designed #7 | 1 | |
| **Front desk working lists**: arrivals, departures, in-house | designed #30 | 1 | The front desk's real home; bulk check-in/out, print |
| Reservations list and search | pattern | 1 | |
| **Group reservation and rooming list** | designed #32 | 1 | Many rooms, names added later, one master folio |
| Modify / cancel reservation (with penalty) | designed #31 | 1 | Dialog: shows policy, penalty, refund, reason |
| Room move | designed #31 | 1 | Dialog: ready rooms, rate change, reason |
| Post charge, take payment, refund, transfer to another folio | designed #31 | 1 | Dialogs on the folio; payment shows method, reference, FX |
| Deposits held | designed #34 | 1 | List of deposits not yet applied, with ageing |
| Cashier shift open and close (blind count) | designed #34 | 1 | Open shift and blind count need their own design |
| Night audit wizard | designed #15 | 1 | |
| Room types and rooms (ongoing management) | designed #33 | 1 | Onboarding covers creation only |
| **Rate plans list and editor** | designed #33 | 1 | Meal plan, cancellation policy, deposit rule, derived plans; #8 is only the grid |
| Guest register export | designed #35 | 1 | For authorities; foreign nationals section |

## 2. Booking engine & channel manager
| Screen | Status | Stage | Notes |
|---|---|---|---|
| Rates and restrictions grid, channel status | designed #8 | 4 | |
| Booking engine (public) | designed #9 | 4 | |
| Booking engine settings | pattern | 4 | Photos, descriptions, policies, payment options, colours |
| Promo codes | pattern | 4 | |
| Channel mapping and sync log | partial #8 | 4 | Will change with the provider |
| **Overbooking / OTA conflict alert** | designed #40 | 4 | What happened, rooms short, options (move, upgrade, walk to partner hotel) |

## 3. Guests & sales
| Screen | Status | Stage | Notes |
|---|---|---|---|
| Guest profile, corporates, group blocks, events | designed #10 | 4 | |
| Guest list and **merge duplicates** | designed #41 | 4 | Duplicates are certain after import |
| Corporate account detail and statement | partial #10 | 4 | Statement design in #21 |
| Travel agents and commissions | pattern | 4 | |
| Event booking flow (enquiry → definite) and spaces setup | partial #10 | 4 | |
| **Guest requests queue (staff side)** | designed #37 | 4 | Where guest-app requests land: assign, done, response time |
| Message templates and message log | designed #43 | 4 | WhatsApp templates need provider approval |

## 4. Restaurant & bar POS
| Screen | Status | Stage | Notes |
|---|---|---|---|
| POS on tablet, kitchen display | designed #11 | 3 | |
| **Menu management** | designed #38 | 3 | Items, modifiers, prices per outlet, tax category, station, availability |
| Outlets, tables and printers setup | designed #38 | 3 | Table map editor |
| Room service orders (from guest app) | designed #37 | 3 | Probably a filter of the POS and kitchen display |
| POS shift close and outlet takings | partial #15 | 3 | |
| Open bills at closing | pattern | 3 | Feeds night audit checks |

## 5. Housekeeping & maintenance
| Screen | Status | Stage | Notes |
|---|---|---|---|
| Housekeeping board, attendant view | designed #12 | 2 | |
| Maintenance and power log | designed #13 | 2 | |
| **Discrepancy check (attendant's physical check)** | designed #39 | 2 | Phone flow: walk the floor, mark occupied/vacant |
| Lost and found list | designed #39 | 2 | |
| Laundry | designed #39 | 2 | Guest laundry charges and linen counts |
| Housekeeping settings | pattern | 2 | Room credits, checklists, check times |
| Asset detail and preventive schedule setup | partial #13 | 2 | |

## 6. Inventory & procurement
| Screen | Status | Stage | Notes |
|---|---|---|---|
| Inventory screens | designed #14 | 5 | |
| Items and suppliers | pattern | 5 | |
| Receiving on a phone | designed #44 | 5 | At the back gate: scan, count, photo of the delivery note |
| Recipe editor | partial #14 | 5 | |

## 7. Finance
| Screen | Status | Stage | Notes |
|---|---|---|---|
| Finance screens | designed #15 | 5 | |
| **Payment matching queue** | designed #34 | 1 | Unmatched transfers and POS settlements; needed from stage 1 |
| City ledger invoices and credit notes | designed #45 | 5 | May need an e-invoice reference and QR code |
| Chart of accounts and manual journal | pattern | 5 | |
| Expenses, supplier bills and payments | designed #45 | 5 | |
| FX rates | pattern | 1 | Daily CBN rate, manual rates with source |
| Budgets | designed #45 | 6 | By property, department and month |
| Tax and charges configuration | designed #27 | 0 | VAT, consumption tax by state, service charge, effective dates |
| Payment methods, bank accounts, POS terminals | designed #27 | 1 | |
| Tax remittances | pattern | 5 | |
| Period close | pattern | 5 | |
| **Approvals inbox** | designed #29 | 1 | One place for over-limit requests, refunds, POs, payroll |

## 8. HR & payroll
| Screen | Status | Stage | Notes |
|---|---|---|---|
| HR and payroll | designed #16 | 5 | |
| Employee profile | pattern | 5 | |
| Clock in / out on shared device | designed #44 | 5 | Same PIN pad as #22 |
| Leave request and approval | pattern | 5 | |
| Service charge distribution | partial #16 | 5 | |
| Payroll settings (statutory rates) | pattern | 5 | Configuration with effective dates |

## 9. Guest app
| Screen | Status | Stage | Notes |
|---|---|---|---|
| Guest app | designed #17 | 4 | |
| Sign in by booking link, expired link | pattern | 4 | |
| Review request and thank-you | partial #17 | 4 | |

## 10. Executive analytics and reports
| Screen | Status | Stage | Notes |
|---|---|---|---|
| Group executive home | designed #1 · **shape built (brick 15)** | 6 | Built: the "All hotels" Home for group-wide people: figures, hotels as rows that open each hotel's Home, Needs attention across the group. Period switch, department and channel mix, pace and city ledger ageing come with their modules |
| Owner's daily report, leakage view | designed #20 | 1 | |
| Board pack | designed #18 | 6 | |
| **Report viewer template** | designed #35 | 1 | One layout for all 14 catalogue reports: filters, totals, export PDF/Excel, print |
| KPI drill-down | partial #35 | 6 | From a stat to the records behind it |

## Compliance
| Screen | Status | Stage | Notes |
|---|---|---|---|
| **Licences and permits tracker** | designed #42 | 2 | In PRODUCT.md but no screen: expiry timeline, documents, alerts |

## Running Vento as a business (internal)
| Screen | Status | Stage | Notes |
|---|---|---|---|
| Data import | designed #23 | 1 | |
| Customer billing (plan, invoices) | designed #46 | 6 | Pricing model still open |
| Support access consent (customer side) | designed #46 | 6 | Grant time-limited access |
| Support console (Vento staff) | pattern | 6 | Internal; plain design is fine |

## Screens that will change as the work goes on
Design these now, but expect a revision when the trigger happens.

| Screen | Trigger | What changes |
|---|---|---|
| Rates grid, channel status, OTA conflict alert (#8) | Channel-manager provider chosen | Mapping, error types and what restrictions the provider supports |
| Folio, invoices, receipts (#7, #21) | FIRS e-invoicing rules confirmed | Invoice reference number, QR code, rules on cancelling issued invoices |
| Payments, payment matching, shift close (#7, #15) | POS terminal providers and foreign-currency settlement decided | Reference fields, statement import vs live matching, USD at the desk or not |
| Check-in and registration card (#6, #21) | Legal guest registration fields verified | Fields and wording |
| Printed receipts and kitchen tickets (#21) | Printers certified, print bridge decided | Layout widths, printing settings screen |
| Check-in key step (#6) | Key-card integration after v1 | "Encode key" instead of "record key issued" |
| Guest messages, owner's daily report (#20) | WhatsApp provider and template approval | Message text must match approved templates |
| Payroll run (#16) | 2026 PAYE rules final | Deduction lines and wording |
| Approval prompt, permissions editor (#22) | Pilot hotels confirm limits | Default limits, maybe more approval levels |
| Tape chart (#3) | First hotel with 200+ rooms | Density, zoom levels, filters |
| Executive home, board pack (#1, #18) | Real data from pilots | Which KPIs earn their place |
| Customer billing | Pricing model decided | Plans and limits shown |
