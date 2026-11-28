# The golden thread: Mr Mensah's Acme stay

One record followed through all ten modules, from Acme Energy's travel desk booking a room to the group dashboard that shows what the stay earned. The other walkthroughs follow one person through their shift; this one follows one stay through everyone's shift. Use it to:
- **see how the modules connect** (`docs/PRODUCT.md`, *How modules connect*): if a hop here can't happen, a module boundary is wrong;
- **demo** the product end to end (about 20 minutes on the demo seed);
- **test** the connections: it becomes one e2e spec that grows with each stage.

Every fact about 25 Nov 2026 comes from the other walkthroughs, which are linked at each hop. This file adds the days around it (the booking, 26–28 Nov, the invoice, the payment and payroll) and doesn't change anything they say.

## Who, goal, device, stage
- **The record:** Mr Daniel Mensah (Ghanaian, Acme Energy Ltd), Executive King, room 502, 25–28 Nov 2026 · 3 nights, Corporate rate ₦180,000.00 per night room only, room charges routed to Acme Energy Ltd.
- **Who touches it:** Acme's travel desk, Tunde Bello (GM), Chiamaka Eze (front desk), Emeka Nwosu, Halima Yusuf and Femi Adeyemi (Calabash), Blessing Udo and Grace Akpan (housekeeping), maintenance, Ibrahim Musa (night audit), Kunle Ade (finance, group), an HR member, Mrs Adaeze Okafor (owner).
- **Goal:** every naira and every room night from this stay can be traced from booking to folio to ledger to city ledger to bank to payroll to the owner's dashboard, with no hop re-keying data from another module.
- **Stage:** first works in stage 1 (book, check in, night audit, settle to Acme, owner's daily report); complete at stage 6 (group analytics). See *Stage* below.
- **Screens:** numbers from `docs/design/claude-design-prompt.md`, given at each hop.

**Amounts.** Amounts marked * include VAT and Lagos consumption tax at the **illustrative** rates in `README.md` (VAT 7.5%, Lagos consumption tax 5%), plus the 10% service charge. One Acme room night: ₦180,000.00 + service charge ₦18,000.00 + VAT ₦13,500.00 + consumption tax ₦9,000.00 = **₦220,500.00***. Tests read rates from configuration.

## The thread

Each hop lists the module, who acts, the screens, the record created or changed, and the rules that protect it.

**Rules used below:** **Scoping** (every row carries `organizationId`; staff limited to properties or entities see only those) · **Availability lock** (inventory per room type and date changes only inside a locked transaction) · **Append-only posting** (folio postings are never edited; corrections are linked negative postings) · **Business date** (postings belong to the property's business date, which only night audit moves) · **Audit event** (every write records actor, device, property, business date, before → after, reason, approver) · **Permission limit** (module × action with limits from `DOMAIN.md`; above a limit needs an approver who isn't the requester).

### 1. Acme's travel desk books (Tue 10 Nov → Sat 14 Nov)
- **Module:** 1 Reservations & Front Desk, with 3 Guests & Sales (corporate account).
- **Who:** Acme's travel desk emails the hotel on 10 Nov, before go-live, so it is entered in the old PMS. Tunde brings it into Vento on 14 Nov with the future reservations import ([going-live](going-live.md), step 9). After go-live the same booking is made in the new reservation flow (#4) with company Acme Energy Ltd.
- **Screens:** 23 data import, 10 corporate account (Acme), 5 reservation detail; after go-live 4 new reservation.
- **Record:** reservation, source `corporate`, status `confirmed`, guarantee `company`, no deposit. One stay: Executive King, 25–28 Nov · 3 nights, rate plan Corporate (Acme) at ₦180,000.00 room only, room 502 pre-assigned, note "Quiet room" from the travel desk. Routing on the stay: `room` → Acme folio, everything else → guest folio. Guest profile for Mr Mensah, merged with "D. Mensah" during the guest import (going-live, step 5).
- **Protected by:** *Scoping:* Acme is set up once for the group; its Corporate rate is a contracted rate for Kora Victoria Island and is bookable only for Acme. *Availability lock:* the import goes through the booking service; the Executive King rows for 25, 26 and 27 Nov are locked, checked against the overbooking limit (0) and decremented. *Audit event:* `import.applied`, `reservation.created` with the import job and source reference; re-importing the row reports "already exists".

### 2. Channels see one fewer Executive King
- **Module:** 2 Booking Engine & Channel Manager.
- **Who:** nobody; Vento does it.
- **Screens:** 8 rates and restrictions / channel manager (last sync, sync errors).
- **Record:** an ARI update for Executive King on 25–27 Nov, sent through the `ChannelProvider` after the import job (one push per job). On 25 Nov it happens again when maintenance puts 503 out of order (hop 7).
- **Protected by:** *Availability lock:* ARI is read from the same inventory rows the booking just changed, after the transaction commits, so channels never see a room that is already sold. *Scoping:* the push carries only Kora Victoria Island's mapped room types. A failed push shows on #8 and is retried; a full resync is on demand.

### 3. Pre-arrival message and guest app (Mon 23 Nov)
- **Module:** 3 Guests & Sales (guest messages), 9 Guest App.
- **Who:** Vento sends; Mr Mensah answers on his phone.
- **Screens:** 43 message templates and log, 17 guest app, 30 arrivals.
- **Record:** a guest message (pre-arrival template, WhatsApp to his `+233…` number, delivery status logged) two days before arrival, with the hotel address and a check-in link. In the guest app he sets his arrival time to 11:30 and confirms his stay. He doesn't upload his passport, so the desk scans it at check-in (hop 4). The stay gets ETA 11:30, which is the "Early arrival 11:30" tag on arrivals and on Blessing's list.
- **Protected by:** *Scoping:* the guest app link opens only this reservation, and it shows only his own folio (see Open questions on the Acme folio). *Audit event:* `reservation.modified` with source `guest_app`. Marketing messages need consent; this one is a service message.

### 4. Check-in to 502 with routing (Wed 25 Nov, 11:35)
- **Module:** 1 Reservations & Front Desk, with 5 Housekeeping (room readiness).
- **Who:** Chiamaka. Blessing cleaned 502 after the previous Acme guest left at 07:40; Grace inspected it at 11:10 ([room attendant's shift](room-attendant-shift.md), steps 3–10).
- **Screens:** 30 arrivals, 6 check-in, 21 registration card, 7 folio.
- **Record:** stay `checked_in`; room 502 `occupied`; guest registration record with the foreign national section (passport `G••••••12`, ECOWAS, arriving from Accra, next destination Accra); key 502 issued. Two folios: **Folio A** (Mr Mensah: extras) with a ₦30,000.00 cash deposit, and **Folio B** (Acme Energy Ltd: room at ₦180,000.00 per night). No room charge yet ([front desk morning](front-desk-morning.md), steps 10–11).
- **Protected by:** *Scoping:* Chiamaka sees only Kora Victoria Island; one guest profile is shared across the group. *Business date:* the deposit posts on 25 Nov, on her open cashier shift. *Audit event:* `guest.registration_captured`, `stay.checked_in`, `folio.routing_set`, `payment.taken`, `key.issued`. The passport number is encrypted at rest and masked in the UI (NDPA 2023).
- **Stage 1 note:** registration, the passport photo and check-in are built in Stage 1 brick 8 (the passport photographed with the desk camera, no MRZ reading, no key record); folios, routing and the deposit come with bricks 10 and 12.

### 5. Dinner at Calabash posted to room (25 Nov, 19:40–21:20)
- **Module:** 4 Restaurant & Bar POS.
- **Who:** Emeka (table 12), Femi (comp), Halima's outlet ([dinner service](waiter-dinner-service.md), steps 5, 9 and 11).
- **Screens:** 11 POS and kitchen display, 21 kitchen ticket, 22 manager PIN, 7 folio as front desk sees it.
- **Record:** POS check for table 12: Grilled tilapia with fried plantain (₦27,000.00) and a Chapman, comped by Femi ("Service delay during power cut"). Posted to room 502 offline at 20:45 and applied at 21:20: subtotal ₦27,000.00 + service charge ₦2,700.00 + VAT ₦2,025.00 + consumption tax ₦1,350.00 = **₦33,075.00*** on **Folio A**, because routing sends only room charges to Acme.
- **Protected by:** *Permission limit:* the comp needs the F&B manager's permission and a reason; it becomes the "1 comp ₦6,000 (Femi)" exception in the owner's daily report. *Scoping and leakage:* post to room only for an in-house guest with a name check; offline, only because 502 was in the cached in-house list. *Business date:* posted on 25 Nov because 25 Nov wasn't closed. *Append-only posting:* the charge carries its tax lines and the POS check id. *Audit event:* `pos_check.posted_to_room`, comp with approver; replayed commands are idempotent.

### 6. The recipe takes stock, and low stock becomes a purchase order (25–27 Nov)
- **Module:** 6 Inventory & Procurement.
- **Who:** Vento deducts; a storekeeper raises the requisition and PO; the PO is approved and received at the gate.
- **Screens:** 14 inventory (stock against par, requisitions, purchase orders, recipe cost), 29 approvals inbox, 44 receiving on a phone.
- **Record:** when the check posts at 21:20, the recipes deduct stock: the tilapia and plantain from the kitchen store, the Chapman's ingredients from the bar store (comped, so costed but not revenue). Tilapia in the kitchen store drops below its reorder level (quantities are illustrative seed values). A requisition (kitchen → main store) follows; the main store is also short, so the storekeeper raises a purchase order to the fish supplier. The PO is approved, received on 27 Nov at the gate with a photo of the delivery note, and the average cost updates.
- **Protected by:** *Scoping:* stores belong to Kora Victoria Island. *Permission limit:* the PO needs approval (limits not yet in the matrix; see Open questions). *Audit event:* `stock.deducted` linked to the POS check, `requisition.submitted`, `purchase_order.approved`, `goods.received`. The food cost % for Calabash on #14 uses the recipe cost at the time of sale.

### 7. Housekeeping turns the room, minibar, and the room next door (26 Nov)
- **Module:** 5 Housekeeping & Maintenance, with 6 Inventory (minibar stock) and 1 (folio).
- **Who:** Blessing (stayover clean, minibar), Grace (inspection), maintenance (WO-0412 on 503).
- **Screens:** 12 attendant view and board, 39 room checks, 13 work orders, 7 folio.
- **Record:**
  - 502 is on Blessing's list on 26 Nov as a stayover; Start → Done → Grace inspects. The 10:00 room check marks 502 occupied, which matches front office status: no discrepancy.
  - Minibar in 502: Coca-Cola ×1 (₦2,500.00) and Cashew nuts ×1 (₦5,000.00): ₦7,500.00 + service charge ₦750.00 + VAT ₦562.50 + consumption tax ₦375.00 = **₦9,187.50*** on **Folio A**, business date 26 Nov; stock deducted from the housekeeping store.
  - Next door, WO-0412 (AC compressor) put 503 out of order for 25–27 Nov on the morning of 25 Nov ([front desk morning](front-desk-morning.md), step 6). Vento refused the OOO until 503's guest had moved, and checked that Executive King wouldn't be short on 25 or 26 Nov, counting Mr Mensah's stay. *Stage 1 note:* Tunde puts 503 out of order from the tape chart; the work order link comes in Stage 2. The OOO removes one Executive King from inventory and sends a new ARI push (hop 2).
- **Protected by:** *Availability lock:* OOO changes the same Executive King rows the booking holds. *Append-only posting* and *Business date* for the minibar charge, which follows routing to Folio A. *Audit event:* assignment status changes, `room.status_changed` with the work order linked, minibar posting naming Blessing. Offline, minibar posting is allowed only for a guest in the cached in-house list.

### 8. Night audit posts the room, the ledger and the owner's report (each night; 25 Nov closed at 01:31 on 26 Nov)
- **Module:** 1 Reservations & Front Desk (night audit), 7 Finance (ledger).
- **Who:** Ibrahim ([night audit](night-audit.md), steps 9–14); the night auditor again for 26 and 27 Nov.
- **Screens:** 15 night audit wizard, 35 report viewer, 20 owner's daily report.
- **Record:** each night, one room charge of ₦180,000.00 with its tax lines, **₦220,500.00***, on **Folio B**, keyed by stay + business date + `room`. In the reports for 25 Nov, Mr Mensah is one of the 85 occupied rooms and in the foreign nationals section of the guest register. The ledger journal for Kora Victoria Island, business date 25 Nov, posted to **Kora Hospitality Ltd**, includes his lines:

  | Line (25 Nov) | Debit | Credit |
  |---|---|---|
  | Guest ledger: room night, Folio B | ₦220,500.00* | |
  | Room revenue (`rooms`) | | ₦180,000.00 |
  | Service charge payable | | ₦18,000.00 |
  | VAT payable | | ₦13,500.00* |
  | Lagos consumption tax payable | | ₦9,000.00* |
  | Guest ledger: Calabash dinner, Folio A | ₦33,075.00* | |
  | Food revenue (`food`) | | ₦27,000.00 |
  | Service charge, VAT, consumption tax payable | | ₦2,700.00, ₦2,025.00*, ₦1,350.00* |
  | Cash (Chiamaka's shift) / guest ledger (deposit) | ₦30,000.00 | ₦30,000.00 |

  Then the owner's daily report for 25 Nov is queued: occupancy 71% (85 of 119), ADR ₦159,000, and the comp from hop 5 among the exceptions ([owner's morning](owner-morning.md), step 1).
- **Protected by:** *Business date:* the date moves only after the journal balances; a second run for 25 Nov returns "Already closed". *Append-only posting:* a retry never posts a second room charge; mistakes after audit are corrections on the next date, linked to the original. *Scoping:* one journal per property per business date, posted to the entity that owns the property. *Audit event:* `night_audit.started`, `night_audit.completed`.

### 9. Check-out and settle to Acme's city ledger (Sat 28 Nov, morning)
- **Module:** 1 Reservations & Front Desk, 7 Finance (city ledger).
- **Who:** Chiamaka (or the agent on the morning shift).
- **Screens:** 30 departures, 7 folio and check-out, 21 A4 invoice.
- **Record:**
  - **Folio A:** dinner ₦33,075.00* + minibar ₦9,187.50* = ₦42,262.50*, less the ₦30,000.00 deposit; balance **₦12,262.50*** paid on the POS terminal with its reference.
  - **Folio B:** 3 × ₦220,500.00* = **₦661,500.00***. "Settle ₦661,500.00 to Acme Energy Ltd." The credit check reads Acme's balance: ₦9,849,000.00 on 26 Nov ([owner's morning](owner-morning.md), step 6), ₦10,510,500.00 after this, if nothing else posts to Acme in between; within the ₦15,000,000.00 limit.
  - A city ledger invoice for ₦661,500.00*, dated 28 Nov, 30-day terms, emailed to Acme's accounts contact. Receipt for Folio A on WhatsApp. Stay `checked_out`; 502 `vacant` + `dirty`, back on Blessing's list as a departure. A post-stay review request follows (hop 3's template set).
  - Ledger, business date 28 Nov: city ledger (Acme) Dr ₦661,500.00*, guest ledger Cr ₦661,500.00*.
- **Protected by:** *Permission limit:* settling to the city ledger within the limit is allowed for front desk; over the limit the same dialog asks for a GM or finance PIN. The credit check runs inside the settlement transaction. *Append-only posting:* the settlement is a `city_ledger` payment on Folio B, not an edit. *Audit event:* `payment.taken`, `folio.settled_to_city_ledger`, `stay.checked_out`.

### 10. Invoice, ageing, and Acme pays by transfer (28 Nov → Tue 15 Dec)
- **Module:** 7 Finance.
- **Who:** Kunle Ade (finance, group); Mrs Okafor and Tunde chase the October invoice ([owner's morning](owner-morning.md), step 6).
- **Screens:** 45 receivables (city ledger invoices), 15 city ledger ageing and statements, 34 payment matching queue.
- **Record:** the 28 Nov invoice ages in 0–30 days. On 15 Dec Acme transfers **₦4,381,500.00** to Kora Hospitality Ltd's bank account with a remittance advice listing two invoices: the 12 Oct opening balance (₦3,720,000.00) and Mr Mensah's (₦661,500.00*). The transfer lands in the matching queue from the bank statement; Kunle matches it to Acme and allocates it to the two invoices, which become paid. Acme's balance drops to ₦6,129,000.00 (the 2 Nov opening invoice, the invoices since go-live, and the 25 Nov departure from 502) if nothing else has posted. Ledger: bank (Kora Hospitality Ltd) Dr ₦4,381,500.00, city ledger (Acme) Cr ₦4,381,500.00.
- **Protected by:** *Scoping:* Kunle's finance permission covers Kora Hospitality Ltd; the payment posts only to that entity's ledger. *Append-only posting:* a wrong match is reversed with a reason, not edited. *Audit event:* `payment.matched`, `city_ledger.payment_allocated`. An unmatched transfer ages in the queue and shows as an exception.

### 11. Service charge reaches the staff through payroll (Mon 30 Nov)
- **Module:** 8 HR & Payroll, with 7 Finance.
- **Who:** an HR member prepares the November payroll run for Kora Hospitality Ltd; Kunle approves it.
- **Screens:** 16 payroll run review and payslip, 29 approvals inbox.
- **Record:** the stay put **₦57,450.00** into Kora Victoria Island's service charge payable for November: 3 × ₦18,000.00 on the room nights, ₦2,700.00 on dinner, ₦750.00 on the minibar. The payroll run distributes the month's pool as a "service charge share" pay component to the eligible staff (Chiamaka, Blessing, Emeka, Halima and others; the basis is an open question), before PAYE, pension, NHF, NSITF and ITF. Ledger: service charge payable Dr, salaries payable and statutory payables Cr.
- **Protected by:** *Permission limit:* only finance or the owner approves a payroll run, and not the member who prepared it. *Scoping:* the run belongs to one entity; staff at other entities aren't in it. *Audit event:* `payroll_run.approved` with totals. Statutory rates come from configuration with effective dates.

### 12. The owner sees it in the numbers (Thu 26 Nov onward)
- **Module:** 10 Executive Analytics.
- **Who:** Mrs Okafor.
- **Screens:** 1 group executive home, 20 owner's daily report, 18 board pack.
- **Record:** no new rows; read models over closed business dates. On 26 Nov the group home shows 25 Nov at Kora Victoria Island: occupancy 71% (85 of 119), ADR ₦159,000, RevPAR ₦113,571 (₦13,515,000 ÷ 119), revenue by department (Mr Mensah adds ₦180,000 to rooms and ₦27,000 to food that day), revenue by channel (corporate), and Acme in city ledger ageing. The November board pack counts his 3 room nights and ₦540,000.00 room revenue (net of tax and service charge), ₦27,000.00 food and ₦7,500.00 minibar; the December pack shows Acme's payment.
- **Protected by:** *Scoping:* the owner sees all four properties; Tunde sees only Kora Victoria Island. *Business date:* figures come only from closed dates, and a property still before its audit shows its last closed date with a label. Post-audit corrections change the date they're posted on, not closed reports.

## Record → modules that touch it
Modules: 1 Reservations & Front Desk · 2 Booking Engine & Channel Manager · 3 Guests & Sales · 4 POS · 5 Housekeeping & Maintenance · 6 Inventory & Procurement · 7 Finance · 8 HR & Payroll · 9 Guest App · 10 Executive Analytics.

| Record | Created in | Changed or read by |
|---|---|---|
| Acme Energy Ltd (company, Corporate rate, credit limit) | 3 (import at go-live) | 1 (booking, settle), 7 (city ledger, ageing, payment), 10 (ageing) |
| Mr Mensah's guest profile | 3 (guest import, merge) | 1 (check-in), 9 (guest app), 3 (messages, stay history) |
| Reservation and stay (502, 25–28 Nov) | 1 (import / #4) | 2 (ARI), 3 (pre-arrival), 9 (ETA), 1 (check-in, check-out), 5 (room readiness), 7 (night audit), 10 (room nights) |
| Executive King availability, 25–27 Nov | 1 (booking) | 2 (ARI push), 5 (503 OOO) |
| Guest registration record | 1 (check-in) | 1 (guest register at night audit) |
| Folio A (guest) | 1 (check-in) | 4 (dinner), 5 (minibar), 1 (POS terminal settlement), 9 (live folio) |
| Folio B (Acme) | 1 (check-in, routing) | 7 (night audit room charges), 1 (settle to city ledger) |
| POS check, table 12 | 4 | 6 (recipe stock), 7 (posting), 10 (F&B revenue, comp in exceptions) |
| Stock, requisition, purchase order | 6 | 4 (recipe deduction), 5 (minibar stock), 7 (supplier payable), 10 (cost of sales) |
| Room 502 status and assignment | 5 | 1 (readiness, check-out), 5 (room check) |
| WO-0412 and 503 OOO | 5 | 1 (availability), 2 (ARI) |
| Ledger journals, Kora Hospitality Ltd | 7 (night audit, settlement, payment) | 8 (service charge payable), 10 (revenue, cash by entity) |
| City ledger invoice (28 Nov) | 1 / 7 (settlement) | 7 (ageing, matching, allocation), 10 (ageing) |
| Bank transfer from Acme (15 Dec) | 7 (statement, matching queue) | 7 (allocation), 10 (cash by entity) |
| Service charge pool, November | 7 (tax lines on postings) | 8 (payroll run) |
| Audit events and exceptions | every module | 1 (owner's daily report), 10 (leakage) |

## Stage
| Hop | First works | Notes |
|---|---|---|
| 1. Corporate booking at the Acme rate | Stage 1 | Rate plans, corporate accounts with credit limits and data import are stage 1 |
| 2. ARI to channels | Stage 4 | Stage 1–3: availability changes, nothing is pushed |
| 3. Pre-arrival message and guest app | Stage 4 | Before that, the ETA is typed by the desk |
| 4. Check-in with routing | Stage 1 | Room readiness from housekeeping from stage 2 |
| 5. Dinner posted to room | Stage 3 | Before that, front desk posts the charge by hand (#31) |
| 6. Recipe stock, requisition, PO | Stage 5 | |
| 7. Housekeeping, minibar, OOO | Stage 2 | Minibar stock deduction from stage 5 |
| 8. Night audit and owner's daily report | Stage 1 | Ledger posting from stage 5 |
| 9. Check-out, settle to Acme | Stage 1 | Balance and statement in stage 1; invoice PDF see Open questions |
| 10. Invoice, ageing, transfer matched | Stage 5 | |
| 11. Service charge in payroll | Stage 5 | |
| 12. Group analytics | Stage 6 | Owner's daily report figures from stage 1 |

## Where the thread can break
- **Routing missing on an imported booking:** the room charge would land on Mr Mensah's folio and he'd be asked to pay ₦661,500.00* at check-out. The import must carry routing, or the company default must apply it.
- **Night audit run twice or resumed:** still exactly three room charges on Folio B, one per business date.
- **Dinner synced after 25 Nov was closed:** it posts to the current business date with the original time kept and is flagged for the auditor; the 25 Nov journal isn't touched.
- **Acme over its limit at check-out:** the settle button reads "Over Acme's limit by ₦…" and asks for a GM or finance PIN; the stay can't be checked out with a balance unless it goes to the city ledger.
- **Transfer doesn't match an invoice combination** (for example short by WHT): it stays in the matching queue, aged, and no invoice is marked paid.
- **Charge corrected after audit:** a linked correction on a later date; the closed reports and the payroll pool for the original month don't change silently.
- **Another organization's Acme:** a company with the same name in another organization is invisible; every query is scoped by `organizationId`.

## Targets
- Demo of the whole thread on the demo seed: about 20 minutes.
- From any hop, the next record is one click away (folio → POS check → recipe; invoice → stay → folios; payment → invoices).
- ⌘K "Mensah" or "502" finds the stay from every module that can see it.
- The golden-thread spec runs in under 5 minutes in CI.

## Becomes tests
`apps/web/e2e/journeys/golden-thread.spec.ts`, on the demo seed, one `test.describe.serial` with one test per hop. A hop whose stage hasn't landed is `test.fixme`; the stage isn't done until its hops pass. Business dates are moved with the night audit itself, not by editing the database.

```ts
test.describe.serial("golden thread: Mr Mensah's Acme stay", () => {
  test("1 · Acme booking holds Executive King 25–27 Nov at ₦180,000 room only", ...);  // stage 1
  test.fixme("2 · ARI push for Executive King 25–27 Nov", ...);                        // stage 4
  test.fixme("3 · pre-arrival WhatsApp logged; guest app sets ETA 11:30", ...);         // stage 4
  test("4 · check-in to 502: two folios, room routed to Acme, ₦30,000 deposit", ...);   // stage 1
  test.fixme("5 · Calabash table 12 posts ₦33,075.00 to Folio A, not Folio B", ...);    // stage 3
  test.fixme("6 · recipe deducts stock; low tilapia leads to a received PO", ...);      // stage 5
  test.fixme("7 · stayover clean, minibar ₦9,187.50 on Folio A, 503 OOO pushes ARI", ...); // stage 2
  test("8 · night audit posts one room charge per night to Folio B", ...);              // stage 1 (ledger lines fixme until stage 5)
  test("9 · check-out settles ₦661,500.00 to Acme within the credit limit", ...);      // stage 1
  test.fixme("10 · invoice ages; ₦4,381,500.00 transfer matched and allocated", ...);  // stage 5
  test.fixme("11 · ₦57,450.00 service charge in November's pool and payroll run", ...); // stage 5
  test.fixme("12 · group home shows 25 Nov: 71%, ADR ₦159,000, Acme in ageing", ...);   // stage 6
});
```

Key assertions:
- Booking: Corporate (Acme) can't be picked for a stay without Acme as the company; Executive King availability for 25–27 Nov drops by one in the same transaction.
- Check-in: routing sends `room` to Folio B; no room charge exists before night audit; passport number never returned in plain text.
- Dinner and minibar: both land on Folio A with tax lines from configuration and the right business date; the comp is costed, not revenue, and is an exception.
- Night audit: three runs give exactly three room charges on Folio B; the 25 Nov journal for Kora Hospitality Ltd balances and contains the lines in hop 8.
- Check-out: Folio A and Folio B both reach ₦0.00; Acme's balance rises by ₦661,500.00*; an invoice exists with 30-day terms.
- Payment: allocation marks both invoices paid; Acme's ageing and balance update; the ledger posts only to Kora Hospitality Ltd.
- Payroll: the service charge pool for November equals the sum of service charge tax lines posted in November at Kora Victoria Island.
- Analytics: RevPAR = room revenue ÷ available room nights excluding 503; a front desk member can't open the group home.
- Every hop writes its audit events with actor, device, property and business date.

## Open questions
- **Booking hop in the spec:** in the seed, Mr Mensah's booking arrives by import (going-live, step 9). Should the spec start from the seeded reservation, or book it through #4 so the new reservation flow is on the thread? *Answered (brick 4):* seeded through the booking service in Stage 1 (VI-2611-0482 on Acme Energy, given by the seed while corporate bookings wait for brick 12), booked through #4 from brick 12.
- **Routing source:** does routing (room → company, extras → guest) come from Acme's account as a default, from the rate plan, or per reservation? Does the future reservations import carry it?
- **Guest app and the company folio:** may Mr Mensah see Folio B and Acme's negotiated rate in the guest app? Corporates often don't want guests to see the rate.
- **Pre-arrival for corporate guests:** sent to the guest, the travel desk, or both? Whose phone and consent count?
- **Low stock to purchase order:** does reaching the reorder level create a draft requisition or PO automatically, or only flag it? Who approves a PO, and up to what amount? The permissions matrix has no procurement rows.
- **Demo world gaps:** no storekeeper, fish supplier, HR member or maintenance member is named; recipe quantities and stock levels for tilapia aren't seeded yet.
- **Business date for back office:** city ledger payments and payroll belong to the entity, not a property. Which business date (or calendar date) do the 15 Dec payment and the 30 Nov payroll run post on?
- **Allocation and WHT:** is a payment allocated per the remittance advice or oldest invoice first by default? Do corporates like Acme deduct WHT from hotel invoices, and how is the shortfall recorded?
- **Service charge distribution:** on charges billed or on money collected? If collected, the ₦54,000.00 on Acme's room nights waits until Acme pays on 15 Dec and goes into December's pool. On what basis is it shared (equal, points, department), and is it taxable under PAYE?
- **Minibar department:** `beverage` or its own revenue code (already open in [room attendant's shift](room-attendant-shift.md)).
- **Stage 1 city ledger:** does stage 1 produce the invoice PDF, or only the balance and statement (already open in [front desk morning](front-desk-morning.md))? Same for the Acme rate being room only.
- **Comp cost in the ledger:** which accounts carry the cost of the comped Chapman, and at what cost (average cost at the time of sale)?
