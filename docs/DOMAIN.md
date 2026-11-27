# Domain guide

Shared vocabulary for the Nigerian hotel group platform. Code, UI copy, table names and tests use these terms exactly. Scope is in `docs/PRODUCT.md`. Update this file as decisions are made, and keep unresolved items under *Open questions*.

## Tenancy, properties and people
| Term | Meaning | Notes |
|---|---|---|
| **Organization** | The customer: a hotel group (or a single independent hotel). | The data boundary. Every domain row has `organizationId`. Never call it "tenant" in code. |
| **Property** | One hotel, resort or serviced-apartment building. Shown in the app as **hotel**. | Name (unique in the group, archived included), logo (PNG, JPEG or WebP), address (street, area, LGA, state; Nigeria only), time zone (default `Africa/Lagos`, fixed once live), check-in and check-out times, current **business date**, owning entity. Status **setting up** until its first night audit, then **live**. Archived, never deleted: devices revoked, access kept for a restore. Operational data belongs to a property. |
| **Booking prefix** | 2–4 capital letters per hotel, unique in the group, used in reservation numbers (`VI` in VI-2611-0483). | Suggested from the hotel's name for new hotels (first three letters after the brand word, a letter added on a clash); editable on Settings › Hotels by `setup.manage` until the hotel's first reservation, then fixed. Demo: VI, IKJ, ABJ, PH. |
| **Go-live** | The point a property starts trading on Vento: its first night audit has completed. | Stored as `properties.live_since` (the business date that audit closed; null until then, set by night audit from brick 13). Before go-live, setup changes need no reason and raise no exceptions; after it, changes that move sellable rooms need a reason and reach the owner's daily report. |
| **Entity** | A legal company inside the organization: holding or operating company. Shown in the app as **company** (Settings › Companies, "Owning company"). | Legal name, RC number (CAC prefix RC, BN, IT, LP or LLP), TIN, VAT registered, base currency NGN. Name, RC number and TIN are each unique in the group. Archived only when it owns no active hotel. A change of owning company or VAT registration on a live hotel applies from the next business date: it is stored as a scheduled change (`pending_entity_id` / `pending_vat_registered` with the date) that night audit applies when it rolls into that date, and cancelling it needs a reason. Ledgers, bank accounts, payroll and contracts belong to an entity. One entity can own several properties. |
| **Department** | Revenue or cost centre within a property: `rooms`, `food`, `beverage`, `events`, `laundry`, `spa`, `other_operated`, `admin`, `sales_marketing`, `maintenance`, `utilities`. | USALI-style; used for revenue, cost and payroll reporting. |
| **Member** | A user in the organization, with a role. | Roles: `owner`, `group_admin`, `general_manager`, `revenue_manager`, `front_desk`, `sales`, `fnb_manager`, `cashier`, `waiter`, `housekeeping_supervisor`, `room_attendant`, `maintenance`, `storekeeper`, `finance`, `hr`, `viewer`. Permissions are module × action, optionally limited to properties or entities (a member **works at** a property when they're given it or have whole-group access). |
| **Whole-group access** | A member who sees every hotel: owners and group admins always, other roles when given "Whole group". | Counted and listed among the people of every hotel, marked "Whole group". Only they get **All hotels**, and only in a group with more than one hotel. |
| **Invite** | An invitation by email to join the group with a role and hotels (or the whole group). | **Not accepted yet** while pending, including when its 7-day link has expired (shown as expired; it can be resent). Home's invite figures and the Invited list count exactly this set, per hotel too: an invite counts at a hotel when it names the hotel or is for the whole group. Cancelled and accepted invites aren't counted. |
| **Hotel switch** | The top-bar choice of the hotel a member is working in, or **All hotels**. | Every page shows the selected hotel only. With All hotels, group pages show every hotel with its name, hotel pages ask to pick one, and group-wide pages (Permissions and limits) are the same either way. It narrows what the member may already see; the server's property scoping decides (a list given a hotel outside the member's access answers "not found", code `PROPERTY_NOT_FOUND`; an archived one "This hotel was archived.", code `PROPERTY_ARCHIVED`). Remembered per browser, never audited. Links to one hotel's data carry it as `?hotel=`. |
| **Guest** | A person who stays, books or dines. | One profile across the group. Nationality, ID (encrypted), preferences, notes, `vip` flag, `blacklisted` with reason. In Stage 1: title, first and last name, phone (E.164; a Nigerian number typed `0803…` is stored `+234803…`), email, nationality; phone or email required; one record across the group, found by name, phone or email while booking; duplicates are merged in Stage 4. Guest search returns phone and email masked only (`+234 803 ••• 4567`, `s•••@example.com`); the full details never reach the device from search, and a picked guest's changes are sent as corrections (an empty field keeps the record). Audit events keep the changed field names and masked contact details, never the full ones (NDPA 2023). The reservation detail shows the booked guest's details to members who can read that hotel's reservations. |
| **Company (corporate account)** | A business with negotiated rates and/or credit. Shown in the app as **corporate account** (or "corporate"), never "company" alone, so it isn't confused with the group's own companies. | Credit limit, payment terms, contact persons, contracted rates per property. Billed through the city ledger. |
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
| Exceed a corporate account's credit limit | – | – | – | – | – | ✓ | ✓ | ✓ |
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
| Set up room types and rooms | – | – | – | – | – | ✓ | – | ✓ |
| Edit a hotel's check-in and check-out times | – | – | – | – | – | ✓ | – | ✓ |
| View the audit log | – | – | – | – | – | ✓ | ✓ | ✓ |
| Set up taxes, payment methods, bank accounts and POS terminals (`finance.setup`) | – | – | – | – | – | – | ✓ | ✓ |
| Enter FX rates (`fx.enter`) | – | – | – | – | – | ✓ | ✓ | ✓ |

The matrix lives as data in `packages/shared/src/permissions.ts` (keys like `stay.rate_override`); keep the two in step. Reading reservations (list, detail) comes with `reservation.manage`, `night_audit.run` or `leakage.view` (read-only for the last two; `RESERVATION_READERS`). `reservation.manage` and discounts within the limit work in a PIN session. The rate override / discount limit is measured per night against the plan price (the demo seed raises front desk to 12%). Reading rate plans and the rate calendar comes with `rates.edit`, `rooms.setup` or `reservation.manage` (read-only for the last two). Reading taxes comes with `rates.edit` or `rooms.setup`; reading payment setup and FX rates with `rooms.setup` or `fx.enter`. VAT can be changed only with whole-group access, a state tax only when every hotel of the group in that state is within access, and a company's bank accounts only when every active hotel it owns is. `finance.setup` and `fx.enter` are refused in a PIN session on a shared device. An organization's owner can override any role's rule except the owner's own (`permissions.set`, with a reason, audited); people who manage the team can view the matrix. Managing people (invite, change role or hotels, remove) uses the same permission as setup. Only an owner can invite, change or remove an owner or group admin; nobody changes their own role or access; a manager limited to some hotels can only hand out those hotels. The night auditor is a `front_desk` member working the night shift; "(night)" means the run-night-audit permission is granted to night-shift front desk staff, not a separate role. Roles not shown (housekeeping, maintenance, storekeeper, hr, sales, viewer) get only their own module's actions: e.g. `room_attendant` and `housekeeping_supervisor` can change room status, do room checks and post minibar charges; only `housekeeping_supervisor` records inspections. A member can't approve their own over-limit action. Archiving or restoring a hotel or company needs a reason. A GM's "Edit a hotel's check-in and check-out times" covers only those two fields of their own hotels; every other hotel and company detail needs "Manage companies, properties, people and their access". A member limited to some hotels who manages setup may change a company only when every active hotel it owns is within their access, and gets access to any hotel they add.

## Devices and sign-in
| Term | Meaning | Notes |
|---|---|---|
| **Device** | A registered phone, tablet or PC used at a property (front desk PC, POS tablet, housekeeping phone). | Registered by a manager, bound to a property, revocable. Offline data and the outbox live on it. |
| **Shared device** | A device used by many staff (front desk, POS, housekeeping). | Staff sign in with a personal 4-digit **PIN**. Sign-out after inactivity (90 seconds on restaurant tablets, 5 minutes elsewhere), enforced by the server too, and after a 12-hour shift at most. A PIN session sees only the device's hotel and can't manage people, permissions, devices or the account, set up rooms or change rates. Five wrong PINs lock it for 15 minutes; after three lockouts a manager must reset it. Full password, plus optional two-step codes from an authenticator app (decision 0023), on personal devices and for managers. |
| **Feature switch** | Whether a module (front desk, restaurant & bar…) is on for a hotel group. | Set by the Vento team, never the hotel (decision 0021). Off means the module isn't shown and its actions are refused; its data is kept. |
| **Audit event** | Append-only record of an action. | Actor, device, property, business date, action, entity, before/after, reason, approver. |

## Rooms, rates and inventory
| Term | Meaning | Notes |
|---|---|---|
| **Room type** | A sellable category: Standard, Deluxe, Executive Suite. | Per property. Name and code (unique in the hotel; codes stay reserved after archiving, names only among active types), bed (`king`, `queen`, `double`, `twin`, `single`) and sofa bed, base occupancy, max adults and max children (max guests = adults + children), size, amenities, sort order (pickers and the tape chart follow it). Room count is derived from active rooms, never typed. Archived, not deleted, and only once it has no active rooms. Inventory is counted per room type per date. |
| **Room** | A physical room with a number. | Room type, number unique in the hotel including archived rooms (up to 10 letters, digits or hyphens: `412`, `G01`, `PH-2`), floor (0 = Ground, minus numbers for basements), features, accessible, connecting rooms (both ways), **front office status** (`vacant` / `occupied`) and **housekeeping status** (`clean → inspected`, `dirty`, `out_of_order`, `out_of_service`). New rooms start `vacant` + `dirty`; before go-live, while every active room is still `dirty`, "Mark inspected" sets them all to `inspected` (with undo). Removing a room archives it; an archived room with no history can be deleted for good, which frees its number. |
| **Out of order (OOO)** | Room unusable (repairs); removed from inventory for the dates. | Needs a work order and reason. |
| **Out of service (OOS)** | Room temporarily not sold (minor issue) but still counted in inventory. | Short-term. |
| **Rate plan** | A price and conditions for a room type: BAR, corporate, non-refundable, bed & breakfast, long-stay, package. | Per hotel. Name (unique among active plans) and code (unique in the hotel, archived included). **Own prices** (standard price per room type, weekday and Fri–Sat, plus date prices) or **derived** from a parent plan with own prices (± % or ± ₦ per night, rounded half-up to the whole naira, one level only; follows the parent's date prices and restrictions). Room types, meal plan (`room_only`, `bed_breakfast`, `half_board`, `full_board`) with meal allocation, cancellation policy, deposit rule, min stay, extra adult per night, who can book it (anyone or corporate accounts only), prices exclusive of taxes and service charge unless marked inclusive. NGN. Archived, not deleted, once used. Archiving a room type keeps it on its plans; restoring it puts it back on them and on plans derived from a parent that sells it. Corporate-only plans aren't offered on bookings until linked to a corporate account (brick 12). |
| **Rate** | The price for a rate plan × room type × night: the date price if set, else the standard price. Derived plans are computed, never stored. A booked stay keeps the nightly prices it was sold at (the **plan price**), which is the reference for discount limits and 'rate below plan'. | Currency, inclusive or exclusive of taxes (shown clearly). |
| **Standard price** | A plan's everyday price per room type: weekday, and optionally Friday and Saturday nights. | Whole naira. |
| **Date price** | A price for specific dates, set from the rate calendar; may carry a season name. | Up to 2 years after the business date; past dates are read-only. A change can be undone until night audit moves the business date on. Removing a room type from a plan, or switching a plan to derived prices, deletes its date prices and restrictions only after the person confirms how many. |
| **Season** | A label on a range of date prices, e.g. Festive season; not a separate record. | The last change wins per date. |
| **Meal allocation** | The part of a meal plan's nightly price that is food revenue, ₦ per room per night; posted to `food` at night audit. | The rest of the price is rooms revenue. Never more than the nightly price it is part of (standard, date or derived): a save that would make it so is refused. |
| **Weekend** | Friday and Saturday nights. | Fixed, not a setting; other patterns use days of the week in Change dates. |
| **Restriction** | Rules per date: `min_stay`, `max_stay`, `closed`, `closed_to_arrival`, `closed_to_departure`. | In Stage 1: `closed`, `closed_to_arrival`, `min_stay` (on the arrival date) per plan with own prices × room type × date; derived plans follow their parent; a plan-level min stay is a floor. `max_stay` and `closed_to_departure` arrive with channels (Stage 4). At the front desk a restriction shows as a warning and can be booked through with a reason (an audit event, not an exception); online channels always enforce them. Synced to channels. |
| **Availability** | **Rooms left** for a room type on a night = active rooms − out of order (from brick 7) − booked. **Bookable** = rooms left + the room type's overbooking limit. | `booked` is kept on one inventory row per room type per date (`room_type_inventory`), created on first use and changed only under `SELECT … FOR UPDATE` in the order room type, then date; rooms are counted live, never stored. Rooms left never show below 0. Archiving rooms, moving them to another type or archiving a type is refused when a night would hold more bookings than rooms plus the limit (`ROOMS_BOOKED`). |
| **Overbooking limit** | Per room type, default 0: how many rooms past rooms left the desk may sell. | Stored on the room type; not editable in Stage 1 (Decision 4). OTA bookings can go past it and are flagged (decision 0007, Stage 4). |
| **Group block (allotment)** | Rooms held for a group or company before names are known. | Pick-up tracked; unpicked rooms released on the **release date**. |

## Reservations & front desk
| Term | Meaning | Notes |
|---|---|---|
| **Reservation** | A booking for one or more rooms and dates. | Source (`direct`, `walk_in`, `phone`, `email`, `booking_engine`, `ota`, `corporate`, `travel_agent`), channel and OTA reference, status `tentative → confirmed → checked_in → checked_out` (or `cancelled`, `no_show`). Number `{booking prefix}-{YYMM booked}-{sequence}` (VI-2611-0483), unique in the group, a sequence per hotel per month. Source adds `whatsapp`; the desk picks Phone, WhatsApp, Email or In person. In Stage 1 the desk creates `confirmed` reservations, deposit or not (Decision 1). Stores the business date it was booked on (Booked today), the deposit due and when, the quoted total incl. taxes, notes (up to 500 characters), who booked it and on which device, and the idempotency key of the request. |
| **Stay (room reservation)** | One room line within a reservation, with its own guest, dates, room type, rate plan and room. | Group bookings have many stays. Room moves happen on the stay. Stores per night the **plan price** and the **sold price**, and the **terms snapshot** (plan name and code, meal plan and allocation, cancellation policy with its deadline and penalty, deposit rule, inclusive or exclusive) as sold; rate and plan changes never alter it. A discount is on the stay with %, reason and who gave it; a restriction booked through is on the stay with its reason. One room per reservation in Stage 1 screens; the server takes a list. |
| **Stay night** | One night of a stay: date, plan price, sold price, extra adult, meal allocation, where the price came from (date or standard price). | Night audit (brick 13) posts the sold price with the tax lines in force that night. |
| **Deposit due** | The amount and time a deposit is due, computed at booking from the plan's deposit rule on the nightly prices plus tax lines. | Due at booking, or N hours after booking, or the hotel's check-in time on the arrival day if sooner. Money is recorded against it from brick 10; unpaid deposits don't release the room in Stage 1. |
| **Discount on a stay** | A % off the plan price on every night, or one rate per night, with a reason (Repeat guest, Corporate rate match, Long stay, Service recovery, Other with text). | Applies to the room price, not the extra adult charge; rounded once, half-up, per night. Measured per night against the plan price for the `stay.rate_override` limit; can't be above the plan, ₦0, or below the meal allocation. An exception in the owner's daily report. |
| **Reservation number** | See Reservation. | |
| **Guarantee** | How the booking is secured: `deposit`, `card`, `company`, `travel_agent`, `none`. | Unguaranteed bookings can auto-release at a configured time on arrival day. |
| **Deposit** | Money received before arrival. | Held on the reservation, transferred to the folio at check-in. |
| **Cancellation policy** | Free cancellation window and penalty (first night, % of stay). | Penalty posts as a charge when applied. Counted back from the hotel's check-in time on the arrival day. Non-refundable = the full stay. The no-show penalty is the late-cancellation penalty. Stored on the reservation as accepted. |
| **Deposit rule** | Per rate plan: none, first night, % of the stay or full stay, due at booking or within N hours of booking (or by arrival if sooner). | The amount includes the tax lines on those nights. |
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
| **Payment method** | Per hotel, each on or off: `cash` (NGN plus chosen foreign currencies), `bank_transfer`, `pos_terminal`, `city_ledger`, `card_online` (Paystack, from Stage 4). `voucher` and `complimentary` aren't configured in Stage 1. | The reference each takes is fixed. Each maps to a ledger account from Stage 5. Transfers and POS terminal payments carry a reference for reconciliation. |
| **Bank account** | A company's account: bank, 10-digit account number (NUBAN), account name, currency. | Unique in the group (bank + number); shown masked (`Zenith Bank ••••4471`); shared by every hotel the company owns. |
| **Guest transfer account** | The NGN account a hotel's guests are told to transfer to. | One per hotel. Changing it on a live hotel emails the owners at once. |
| **POS terminal** | A card terminal registered to a hotel: provider, name, terminal ID unique in the group, the bank account it settles into. | POS payments must name an active terminal of the hotel (brick 10). |
| **FX rate** | Naira per unit of USD, GBP or EUR for a rate date, group-wide, source CBN official (`cbn`; `market` from brick 10), up to 4 decimals. | A hotel uses the latest rate dated on or before its business date. A replaced rate is kept, superseded. Payments store their own copy. |
| **City ledger** | Receivables owed by companies and travel agents after check-out. | Invoices, statements, ageing 0–30, 31–60, 61–90, 90+; credit limit warnings. |
| **Cashier shift** | A period a cashier holds a float and takes payments. | Opening float, takings by method, expected vs counted cash, variance with reason. |
| **Business date** | The hotel's accounting day. | Moves forward only at night audit; can differ from the calendar date after midnight. |
| **Night audit** | End-of-day close for a property. | Checks (arrivals not checked in, departures not checked out, open POS checks, unbalanced shifts) → mark no-shows → post room and tax charges → produce daily reports → post to the ledger → roll the business date. Runs once per date; idempotent. |
| **Room night** | One room occupied for one night. | Occupancy = occupied room nights ÷ available room nights (excluding OOO). |
| **ADR / RevPAR** | Average daily rate = room revenue ÷ occupied room nights; RevPAR = room revenue ÷ available room nights. | Net of taxes and service charge. |

## Taxes and charges
| Term | Meaning | Notes |
|---|---|---|
| **VAT** | Federal tax, one per group, with dated rates and the categories it applies to. | Charged only when the hotel's owning company is VAT registered on that business date. Rates are data to verify against current law. |
| **Consumption tax** | State tax (`state_tax`), one or more per state per group (e.g. Lagos consumption tax, paid to Lagos State IRS), applying to every hotel of the group in that state, with dated rates. | Vento ships a template for Lagos only; other states are added by hand. |
| **Service charge** | Hotel charge, at most one per hotel, configured with dated rates like a tax; not paid to an authority. | May be distributed to staff through payroll. |
| **Tax rate** | A dated version of a tax or charge: rate %, categories, calculated on the charge or the charge plus service charge, start date, source, reason, verified by and on. | Status `scheduled`, `current`, `past` or `stopped`. Never edited in place; a change is a new version starting after the business date of every hotel it covers. A version may be a stop ("not charged from …"). |
| **Tax category** | What kind of sale a charge is, for tax: `accommodation`, `food`, `beverage`, `events`, `laundry`, `other`, `exempt`. | `exempt` never gets a line. |
| **To verify** | A rate in force with no recorded legal source and verifier. | Seeded and template rates start this way; the first night audit won't run while one is in force. |
| **Tax line** | Each tax or charge computed on a posting: tax, rate version, rate, base and amount, rounded half-up to the kobo once. | Stored at posting, never recomputed; reversals copy them negated. Lines appear as service charge, VAT, then state taxes. |
| **Rounding line** | The kobo difference on an inclusive price. | Part of net revenue, never of a tax. |
| **Inclusive / exclusive pricing** | Per rate plan and menu. | Inclusive prices back out the net and put any rounding difference on one rounding line, so the lines sum to the price. The folio always shows the breakdown. |

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
| **Exception** | Any event the owner should see: rate below plan, override, discount, comp, void, refund, quick turn, early checkout with refund, unmatched payment, cash variance, POS void after send, stock variance above threshold, room count changed (room archived, restored or moved to another type after go-live; its audit events carry `roomCountChange: true` and `liveProperty: true`), setup changed (live hotel archived or restored, owning company changed or a scheduled change cancelled, company TIN or VAT registration changed; tax or charge added, scheduled, stopped or cancelled; bank account added, changed, archived or restored; guest transfer account changed; POS terminal added, changed, archived or restored; its audit events carry `exception: 'setup_changed'` and `liveProperty: true`), rate lowered for tonight (after go-live, a plan's price for the current business date lowered; or a plan × room type removed and added back cheaper the same business date; or a new or restored plan open to anyone priced below the base plan tonight; one event per save carries `exception: 'rate_lowered_tonight'` and `liveProperty: true`). | Generated from audit events; thresholds are configuration. Listed in the owner's daily report with staff names. Discount: a stay sold below its plan price (`stay.discount_applied` with `exception: 'discount'` and `liveProperty: true`), every one, with name, amount and reason (Decision 3). |
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
- Base currency `NGN` (₦). Foreign currency stored with its FX rate and source. FX rates are naira per unit, CBN official, entered daily.
- Addresses: line 1, area, LGA, state, country. Nigerian states and LGAs from a fixed list in `@vento/shared` (`NIGERIAN_STATES`: 36 states + FCT; `NIGERIAN_LGAS`: 774 LGAs by state).
- Phone numbers in E.164 (`+234…` and foreign).
- Dates shown as `25 Nov 2026`, stays as `25–28 Nov 2026 · 3 nights`. Money as `₦125,000.00` and `$85.00`.
- Personal data under the **NDPA 2023**: collect only what's needed, never store BVN or raw card data, consent for marketing, export and deletion on request (except records the law says to keep). ID and passport numbers are encrypted at rest and masked in the UI.

## Open questions
- Channel manager provider (e.g. SiteMinder, Channex, a local provider) and certification path.
- Payments: Paystack for cards and transfers. Which POS terminal providers (Moniepoint, OPay, bank terminals) do we reconcile with, and how (statement import vs API)?
- Foreign-currency guests: settled (owner, Nov 2026): folios, charges and tax lines are always in naira; foreign cash is taken as tender at the day's rate from brick 10.
- FX rates: fetch the CBN official rate automatically (later), or keep typing it daily as now?
- Tax rates and bases: VAT and Lagos consumption tax rates, whether consumption tax applies alongside VAT, and on what base, are seeded To verify; finance or legal must confirm them under the Nigeria Tax Act 2025 and the Lagos law before the pilot.
- Key-card systems to support after v1 (ASSA ABLOY VingCard, Salto, Dormakaba).
- Fiscal / e-invoicing requirements under the 2025 tax reform (FIRS e-invoicing). (State consumption tax templates: Lagos only; other states added by hand, owner, Nov 2026.)
- WhatsApp Business API provider (e.g. Termii, Twilio) and template approval. SMS and email providers (e.g. Termii, Resend).
- Printing: which thermal printers to certify, and whether network kitchen printers need a local print bridge app or Android print services are enough.
- Which legacy PMS exports to support for import first (e.g. Opera, eZee, Hotelogix, Excel).
- Subscription pricing for customers: per property, per room, or per module.
- Default permission limits and exception thresholds — confirm with pilot hotels.
- Company identifiers: the current TIN format(s) under the Nigeria Tax Administration Act 2025 (single Tax ID with the JTB and NRS; older TINs look like `21847390-0001`) and CAC's current number prefixes (RC, BN, IT, LP, LLP). Until confirmed, validation is loose: a CAC prefix and up to 8 digits, and 8–14 digits with an optional hyphen.
- Kitchen display while offline: does it need a local server/bridge on the hotel network, or do we rely on printed tickets during outages?
- Terms of Service and Privacy Policy (NDPA 2023): to be written, with legal review, before the first paying customer. Sign-up shows no consent line until these pages exist, so it never links to nothing.
