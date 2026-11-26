# Domain guide

Shared vocabulary for the Nigerian hotel group platform. Code, UI copy, table names and tests use these terms exactly. Scope is in `docs/PRODUCT.md`. Update this file as decisions are made, and keep unresolved items under *Open questions*.

## Tenancy, properties and people
| Term | Meaning | Notes |
|---|---|---|
| **Organization** | The customer: a hotel group (or a single independent hotel). | The data boundary. Every domain row has `organizationId`. Never call it "tenant" in code. |
| **Property** | One hotel, resort or serviced-apartment building. | Address, star rating, time zone (default `Africa/Lagos`), check-in/out times, current **business date**, owning entity. Operational data belongs to a property. |
| **Entity** | A legal company inside the organization: holding or operating company. | RC number, TIN, VAT status, base currency NGN. Ledgers, bank accounts, payroll and contracts belong to an entity. One entity can own several properties. |
| **Department** | Revenue or cost centre within a property: `rooms`, `food`, `beverage`, `events`, `laundry`, `spa`, `other_operated`, `admin`, `sales_marketing`, `maintenance`, `utilities`. | USALI-style; used for revenue, cost and payroll reporting. |
| **Member** | A user in the organization, with a role. | Roles: `owner`, `group_admin`, `general_manager`, `revenue_manager`, `front_desk`, `sales`, `fnb_manager`, `cashier`, `waiter`, `housekeeping_supervisor`, `room_attendant`, `maintenance`, `storekeeper`, `finance`, `hr`, `viewer`. Permissions are module × action, optionally limited to properties or entities. |
| **Guest** | A person who stays, books or dines. | One profile across the group. Nationality, ID (encrypted), preferences, notes, `vip` flag, `blacklisted` with reason. |
| **Company (corporate account)** | A business with negotiated rates and/or credit. | Credit limit, payment terms, contact persons, contracted rates per property. Billed through the city ledger. |
| **Travel agent** | Agency that books on behalf of guests. | Commission %, may have a city ledger account. |
| **Supplier** | Vendor of goods or services. | Payables, purchase orders, WHT status. |
| **Employee** | Staff member on payroll, or casual on a daily rate. | Belongs to an entity, works at one or more properties. |

## Permissions matrix
Permissions are `module.action`, granted by role and optionally limited to properties or entities. Limits (amounts, %) are configuration per organization; the values below are **seed defaults**. Anything above a limit needs approval from a role that has a higher limit (the approver enters their PIN on the same device, or approves from the approvals inbox on their own phone). Every use is an audit event with a reason.

| Action | front_desk | cashier | waiter | revenue_manager | fnb_manager | general_manager | finance | owner / group_admin |
|---|---|---|---|---|---|---|---|---|
| Create / modify reservation | ✓ | – | – | ✓ | – | ✓ | – | ✓ |
| Rate override / discount on a stay | ≤ 10% | – | – | ≤ 25% | – | ≤ 50% | – | any |
| Waive cancellation / no-show penalty | – | – | – | ✓ | – | ✓ | – | ✓ |
| Room move (before audit) | ✓ | – | – | ✓ | – | ✓ | – | ✓ |
| Void folio posting, same business date | own postings | – | – | – | – | ✓ | ✓ | ✓ |
| Correct folio posting after night audit | – | – | – | – | – | – | ✓ | ✓ |
| Refund | – | – | – | – | – | ≤ ₦100,000 | ✓ | any |
| Comp room night | – | – | – | – | – | ✓ | – | ✓ |
| Settle to city ledger (within credit limit) | ✓ | – | – | – | – | ✓ | ✓ | ✓ |
| Exceed a company's credit limit | – | – | – | – | – | ✓ | ✓ | ✓ |
| Post POS bill to a room | – | ✓ | ✓ | – | ✓ | ✓ | – | ✓ |
| POS void before ticket sent | – | ✓ | ✓ | – | ✓ | ✓ | – | ✓ |
| POS void after ticket sent / comp item | – | – | – | – | ✓ | ✓ | – | ✓ |
| POS discount on a bill | – | ≤ 5% | – | – | ≤ 20% | ≤ 50% | – | any |
| Reopen a closed POS bill | – | – | – | – | ✓ | ✓ | – | ✓ |
| Open / close cashier shift | ✓ | ✓ | – | – | ✓ | ✓ | ✓ | ✓ |
| Edit rates and restrictions | – | – | – | ✓ | – | ✓ | – | ✓ |
| Run night audit | ✓ (night) | – | – | – | – | ✓ | ✓ | ✓ |
| Approve payroll run | – | – | – | – | – | – | ✓ | ✓ |
| View owner's daily report and leakage alerts | – | – | – | – | – | ✓ | ✓ | ✓ |
| Change permissions or limits | – | – | – | – | – | – | – | owner only |
| Manage companies, properties, people and their access | – | – | – | – | – | – | – | ✓ |
| View the audit log | – | – | – | – | – | ✓ | ✓ | ✓ |

The matrix lives as data in `packages/shared/src/permissions.ts` (keys like `stay.rate_override`); keep the two in step. An organization's owner can override any role's rule except the owner's own (`permissions.set`, with a reason, audited); people who manage the team can view the matrix. Managing people (invite, change role or hotels, remove) uses the same permission as setup. Only an owner can invite, change or remove an owner or group admin; nobody changes their own role or access; a manager limited to some hotels can only hand out those hotels. The night auditor is a `front_desk` member working the night shift; "(night)" means the run-night-audit permission is granted to night-shift front desk staff, not a separate role. Roles not shown (housekeeping, maintenance, storekeeper, hr, sales, viewer) get only their own module's actions: e.g. `room_attendant` and `housekeeping_supervisor` can change room status, do room checks and post minibar charges; only `housekeeping_supervisor` records inspections. A member can't approve their own over-limit action.

## Devices and sign-in
| Term | Meaning | Notes |
|---|---|---|
| **Device** | A registered phone, tablet or PC used at a property (front desk PC, POS tablet, housekeeping phone). | Registered by a manager, bound to a property, revocable. Offline data and the outbox live on it. |
| **Shared device** | A device used by many staff (POS, housekeeping). | Staff sign in with a personal 4-digit **PIN**. Sign-out after inactivity (90 seconds on restaurant tablets, 5 minutes elsewhere), enforced by the server too, and after a 12-hour shift at most. A PIN session sees only the device's hotel and can't manage people, permissions, devices or the account. Five wrong PINs lock it for 15 minutes; after three lockouts a manager must reset it. Full password, plus optional two-step codes from an authenticator app (decision 0023), on personal devices and for managers. |
| **Feature switch** | Whether a module (front desk, restaurant & bar…) is on for a hotel group. | Set by the Vento team, never the hotel (decision 0021). Off means the module isn't shown and its actions are refused; its data is kept. |
| **Audit event** | Append-only record of an action. | Actor, device, property, business date, action, entity, before/after, reason, approver. |

## Rooms, rates and inventory
| Term | Meaning | Notes |
|---|---|---|
| **Room type** | A sellable category: Standard, Deluxe, Executive Suite. | Max occupancy, bed type, amenities, photos. Inventory is counted per room type per date. |
| **Room** | A physical room with a number. | Room type, floor, features, **front office status** (`vacant` / `occupied`) and **housekeeping status** (`clean → inspected`, `dirty`, `out_of_order`, `out_of_service`). |
| **Out of order (OOO)** | Room unusable (repairs); removed from inventory for the dates. | Needs a work order and reason. |
| **Out of service (OOS)** | Room temporarily not sold (minor issue) but still counted in inventory. | Short-term. |
| **Rate plan** | A price and conditions for a room type: BAR, corporate, non-refundable, bed & breakfast, long-stay, package. | Meal plan (`room_only`, `bed_breakfast`, `half_board`, `full_board`), cancellation policy, deposit rule, channels it's sold on. Derived plans (e.g. BAR − 10%) follow their parent. |
| **Rate** | The price for a rate plan × room type × date. | Currency, inclusive or exclusive of taxes (shown clearly). |
| **Restriction** | Rules per date: `min_stay`, `max_stay`, `closed`, `closed_to_arrival`, `closed_to_departure`. | Synced to channels. |
| **Availability** | Rooms of a type sellable on a date = rooms − OOO − booked − blocked. | Changed only in locked transactions. Overbooking limit per room type is configuration. |
| **Group block (allotment)** | Rooms held for a group or company before names are known. | Pick-up tracked; unpicked rooms released on the **release date**. |

## Reservations & front desk
| Term | Meaning | Notes |
|---|---|---|
| **Reservation** | A booking for one or more rooms and dates. | Source (`direct`, `walk_in`, `phone`, `email`, `booking_engine`, `ota`, `corporate`, `travel_agent`), channel and OTA reference, status `tentative → confirmed → checked_in → checked_out` (or `cancelled`, `no_show`). |
| **Stay (room reservation)** | One room line within a reservation, with its own guest, dates, room type, rate plan and room. | Group bookings have many stays. Room moves happen on the stay. |
| **Guarantee** | How the booking is secured: `deposit`, `card`, `company`, `travel_agent`, `none`. | Unguaranteed bookings can auto-release at a configured time on arrival day. |
| **Deposit** | Money received before arrival. | Held on the reservation, transferred to the folio at check-in. |
| **Cancellation policy** | Free cancellation window and penalty (first night, % of stay). | Penalty posts as a charge when applied. |
| **Check-in** | Arrival: verify ID, capture guest registration, assign room, take deposit or authorisation, issue key. | Foreign nationals: passport number, nationality, visa/permit details, arrival from/next destination, as required by law. |
| **Walk-in** | Guest without a prior booking. | Created and checked in in one flow. |
| **Room move** | Changing a guest's room during a stay. | Reason recorded; rate change optional. |
| **Check-out** | Departure: settle folio, close stay, room becomes `vacant` + `dirty`. | Can't check out with an unsettled balance unless transferred to the city ledger. |
| **Day use** | Stay with arrival and departure on the same date. | Counts in revenue, not in occupied room nights. |
| **No-show** | Guaranteed guest who didn't arrive by night audit. | Policy charge can apply. |

## Folios, payments and the night audit
| Term | Meaning | Notes |
|---|---|---|
| **Folio** | The guest's bill for a stay. A stay can have several folios (e.g. room to company, extras to guest). | Status `open → settled → closed`. Balance = charges − payments, derived from postings. |
| **Posting** | A line on a folio: a **charge** (room, F&B, minibar, laundry, event, penalty, tax) or a **payment**. | Append-only. Business date, department, revenue code, amount, currency, tax lines, user, source (POS check id, night audit). |
| **Void / correction** | Reversal of a posting. | New negative posting linked to the original, with reason and user. Post-audit corrections need a higher permission. |
| **Routing** | Rule that sends certain charges to another folio (e.g. room & breakfast to the company). | Set on the stay. |
| **Payment method** | `cash`, `bank_transfer`, `pos_terminal`, `card_online` (Paystack), `city_ledger`, `voucher`, `complimentary`. | Each maps to a ledger account. Transfers and POS terminal payments carry a reference for reconciliation. |
| **City ledger** | Receivables owed by companies and travel agents after check-out. | Invoices, statements, ageing 0–30, 31–60, 61–90, 90+; credit limit warnings. |
| **Cashier shift** | A period a cashier holds a float and takes payments. | Opening float, takings by method, expected vs counted cash, variance with reason. |
| **Business date** | The hotel's accounting day. | Moves forward only at night audit; can differ from the calendar date after midnight. |
| **Night audit** | End-of-day close for a property. | Checks (arrivals not checked in, departures not checked out, open POS checks, unbalanced shifts) → mark no-shows → post room and tax charges → produce daily reports → post to the ledger → roll the business date. Runs once per date; idempotent. |
| **Room night** | One room occupied for one night. | Occupancy = occupied room nights ÷ available room nights (excluding OOO). |
| **ADR / RevPAR** | Average daily rate = room revenue ÷ occupied room nights; RevPAR = room revenue ÷ available room nights. | Net of taxes and service charge. |

## Taxes and charges
| Term | Meaning | Notes |
|---|---|---|
| **VAT** | Federal value added tax on accommodation and F&B. | Rate and exemptions from versioned configuration. |
| **Consumption tax** | State tax on hotel, restaurant and event sales (e.g. Lagos Hotel Occupancy and Restaurant Consumption Law). | Rate set per state with effective dates. |
| **Service charge** | Percentage added to the bill by the hotel. | Rate per property; may be distributed to staff through payroll. |
| **Tax line** | Each tax or charge computed on a posting. | Stored with rate, base and amount at the time of posting; never recomputed retroactively. |
| **Inclusive / exclusive pricing** | Whether shown prices already include taxes. | Per rate plan and menu; the folio always shows the breakdown. |

## Distribution
| Term | Meaning | Notes |
|---|---|---|
| **Channel** | A sales channel: booking engine, OTA (Booking.com, Expedia, Airbnb, Hotels.ng), GDS through the provider. | Mapped room types and rate plans per channel. |
| **Channel manager provider** | Third-party service that relays inventory, rates and bookings to OTAs. | One provider behind a `ChannelProvider` interface. |
| **ARI** | Availability, rates and inventory pushed to channels. | Pushed on every change, debounced; full resync on demand. |
| **OTA reservation** | Booking delivered by a channel. | Stored with raw payload; modifications and cancellations matched by channel reference; idempotent. |
| **Commission** | What an OTA or travel agent charges per booking. | Recorded per reservation for net revenue reporting. |
| **Virtual card (VCC)** | Card issued by an OTA to pay for a prepaid booking. | Charged through the provider's tokenisation; never stored raw. |

## Guests & sales
| Term | Meaning | Notes |
|---|---|---|
| **Negotiated rate** | A corporate's contracted rate plan per property and period. | Bookable only for that company. |
| **Event booking** | A hall, meeting room or banquet booking. | Space, date and time slots, pax, package per head, **banquet event order (BEO)**, status `enquiry → tentative → definite → completed` (or `lost`). Charges post to a folio. |
| **Guest message** | Confirmation, pre-arrival, in-stay, post-stay messages. | WhatsApp, SMS or email; templates; marketing only with consent. |

## Restaurant & bar POS
| Term | Meaning | Notes |
|---|---|---|
| **Outlet** | A point of sale: restaurant, bar, pool bar, room service, events. | Has menus, tables, printers, opening hours, department. |
| **Menu item** | Something sold: dish, drink, bottle, cocktail. | Price per outlet, modifiers, tax category, recipe, kitchen or bar station. |
| **Check (bill)** | An order for a table, tab or room. | Status `open → sent → billed → paid / posted_to_room` (or `voided`). Covers count. |
| **Ticket** | The part of a check sent to the kitchen or bar. | Printed or shown on screen. |
| **Post to room** | Settle a check on a guest's folio. | Requires an in-house guest and a matching name or PIN; respects the guest's credit limit and "no post" flag. |
| **Comp** | Complimentary item or check. | Permission + reason; costed but not revenue. |
| **Recipe** | Ingredients and quantities for a menu item. | Deducts stock on sale; drives food cost %. |

## Housekeeping & maintenance
| Term | Meaning | Notes |
|---|---|---|
| **Assignment** | Rooms given to an attendant for a shift. | Credits per room type; status `pending → in_progress → done → inspected`; a failed inspection sets it to `reclean` (room back to `dirty`) and it returns to `in_progress` when the attendant restarts. |
| **Inspection** | Supervisor check of a cleaned room. | Pass → `inspected`; fail → back to `dirty` with notes. |
| **Minibar posting** | Items consumed from the minibar. | Posts charges to the folio, deducts stock. |
| **Lost and found** | Item found in a room or area. | Found by, where, storage location, status `stored → returned / disposed`. |
| **Work order** | A maintenance task. | Room or asset, priority, status `open → assigned → in_progress → resolved → closed`, parts used, cost. Can put a room OOO. |
| **Asset** | Equipment: generator, AC unit, lift, pump, borehole, solar inverter. | Service history, preventive schedule. |
| **Power log** | Hours on grid, generator and solar; diesel added and consumed. | Diesel cost per occupied room night in analytics. |

## Inventory & procurement
| Term | Meaning | Notes |
|---|---|---|
| **Store** | A stock location: `main`, `kitchen`, `bar`, `housekeeping`, `engineering`, `fuel`. | Per property. |
| **Item** | Something stocked. | Purchase unit, issue unit and conversion, par level, reorder level, average cost. |
| **Requisition** | Department request for items from a store. | `draft → submitted → approved → issued`. |
| **Purchase order** | Order to a supplier. | `draft → approved → sent → partially_received → received → closed`. Receiving updates stock and average cost. |
| **Stock count** | Physical count of a store. | Variance posted as an adjustment with reason. |

## HR & payroll
| Term | Meaning | Notes |
|---|---|---|
| **Roster / shift** | Planned working hours per employee and department. | Morning, afternoon, night shifts; attendance against it. |
| **Payroll run** | Monthly pay calculation for an entity. | Gross → statutory deductions (PAYE, pension 8% employee / 10% employer by default, NHF, NSITF, ITF) → net. All rates configurable with effective dates. |
| **Pay component** | Basic, housing, transport, allowances, service charge share, deductions. | Taxable flag, pensionable flag. |
| **Casual staff** | Daily-rate workers (events, peak season). | Paid weekly or per event. |

## Compliance
| Term | Meaning | Notes |
|---|---|---|
| **Guest registration record** | The legally required register of guests, including foreign national details. | Exportable for authorities on request. |
| **Licence / permit** | Operating licences per property: state tourism registration, NIHOTOUR, liquor licence, fire certificate, health permits, signage. | Issue/expiry dates, documents, alerts before expiry. |
| **Tax remittance** | VAT, consumption tax, WHT, PAYE remitted to the right authority. | Record what was filed, when and the receipt; filing happens outside the app. |

## Leakage controls
| Term | Meaning | Notes |
|---|---|---|
| **Room discrepancy** | Front desk status and housekeeping's physical check disagree. | `sleeper` = system occupied, room found vacant; `skipper` = system vacant, room found used. Checked at configured times (e.g. 10:00, 16:00, 22:00); each one must be resolved with a reason. |
| **Exception** | Any event the owner should see: rate below plan, override, discount, comp, void, refund, quick turn, early checkout with refund, unmatched payment, cash variance, POS void after send, stock variance above threshold. | Generated from audit events; thresholds are configuration. Listed in the owner's daily report with staff names. |
| **Blind count** | Cashier counts the drawer without seeing the expected total. | Variance = counted − expected, revealed after submission. |
| **Owner's daily report** | Morning summary after night audit. | Sent by WhatsApp and email to owners and GMs; one page. |

## Reports catalogue (v1)
| Report | Who | When |
|---|---|---|
| Manager's flash | GM, owner | Daily after night audit: occupancy, ADR, RevPAR, revenue by department, cash, vs budget and last year |
| Owner's daily report | Owner, GM | Daily after night audit: summary + exceptions |
| Arrivals / departures / in-house | Front desk | Live, printable |
| Guest register | Front desk, authorities | On request: all guests with registration details, foreign nationals section |
| Room status & discrepancy | Housekeeping, GM | Live and at each check time |
| Cashier / shift report | Finance | Per shift: takings by method, float, variance |
| Revenue by department & payment method | Finance | Per business date and period |
| Deposits held | Finance | Live: advance deposits not yet applied |
| City ledger ageing | Finance, sales | Live |
| No-shows & cancellations | Revenue | Per period, with penalties charged/waived |
| Rate override & discount | GM, owner | Per period, by staff |
| POS sales & voids | F&B manager | Per outlet, shift and period |
| Stock & variance | Storekeeper, F&B | Per count |
| Tax report | Finance | Per period: VAT, consumption tax by state, service charge |

## Data import
| Term | Meaning | Notes |
|---|---|---|
| **Import job** | Upload of a CSV/Excel file for one kind of data. | `uploaded → validated → previewed → applied → undone`. Errors listed by row; nothing applied until the whole file is valid or the user skips bad rows. Undo within 24 hours if nothing depends on the rows. |
| **Opening balance** | Balance brought in at go-live: city ledger per company, deposits held, ledger accounts per entity, stock per store. | Posted as dated opening entries, clearly marked. |

## Locale defaults
- Base currency `NGN` (₦). Foreign currency stored with its FX rate and source.
- Addresses: line 1, area, LGA, state, country. Nigerian states and LGAs from a fixed list.
- Phone numbers in E.164 (`+234…` and foreign).
- Dates shown as `25 Nov 2026`, stays as `25–28 Nov 2026 · 3 nights`. Money as `₦125,000.00` and `$85.00`.
- Personal data under the **NDPA 2023**: collect only what's needed, never store BVN or raw card data, consent for marketing, export and deletion on request (except records the law says to keep). ID and passport numbers are encrypted at rest and masked in the UI.

## Open questions
- Channel manager provider (e.g. SiteMinder, Channex, a local provider) and certification path.
- Payments: Paystack for cards and transfers. Which POS terminal providers (Moniepoint, OPay, bank terminals) do we reconcile with, and how (statement import vs API)?
- Foreign-currency guests: settle in USD at the desk, or convert to NGN at check-out at a configured rate?
- Key-card systems to support after v1 (ASSA ABLOY VingCard, Salto, Dormakaba).
- Fiscal / e-invoicing requirements under the 2025 tax reform (FIRS e-invoicing) and which states' consumption tax rules to ship first.
- WhatsApp Business API provider (e.g. Termii, Twilio) and template approval. SMS and email providers (e.g. Termii, Resend).
- Printing: which thermal printers to certify, and whether network kitchen printers need a local print bridge app or Android print services are enough.
- Which legacy PMS exports to support for import first (e.g. Opera, eZee, Hotelogix, Excel).
- Subscription pricing for customers: per property, per room, or per module.
- Default permission limits and exception thresholds — confirm with pilot hotels.
- Kitchen display while offline: does it need a local server/bridge on the hotel network, or do we rely on printed tickets during outages?
- Terms of Service and Privacy Policy (NDPA 2023): to be written, with legal review, before the first paying customer. Sign-up shows no consent line until these pages exist, so it never links to nothing.
