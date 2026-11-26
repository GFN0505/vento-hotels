# Going live

## Who, goal, device, stage
- **Who:** Mrs Adaeze Okafor (owner) sets up the group and handles money imports. Tunde Bello (GM, Kora Victoria Island) runs the rest. A Vento onboarding specialist helps through time-limited support access. Chiamaka Eze and Ibrahim Musa run the parallel day and the first audit.
- **Goal:** move Kora Victoria Island off Excel and its old PMS in one week, with every room, guest, corporate balance and future booking (with its deposit) in Vento, and nothing double-booked or double-counted.
- **Device:** Mrs Okafor's laptop and phone; Tunde's laptop; then the hotel's front desk PCs, POS tablets and housekeeping phones.
- **Stage:** 1 (data import is in stage 1). Corporate accounts, city ledger and ledger opening balances belong to stages 4–5, POS devices to stage 3 (see Open questions). Kora Abuja and the other properties are not part of this walkthrough.
- **Screens:** 19 onboarding, 24 sign in and accept invite, 25 settings (property, entities, members, devices), 26 permissions and limits, 27 taxes and payments setup, 33 rooms and rate plans, 23 data import, 41 merge duplicate guests, 22 shared device sign-in, 46 account and support access, 35 report viewer, 15 night audit, 28 audit log.

**Setting:** Thursday 12 Nov to Monday 23 Nov 2026. Go-live is the night audit that closes business date 16 Nov 2026.

## The walkthrough

1. **Thu 12 Nov, 10:00 · Create the group.**
   - *Does:* Mrs Okafor signs up, sets up 2FA, and follows onboarding (#19), which asks only for names and the state: organization "Kora Hotels Group" → company "Kora Hospitality Ltd" → hotel "Kora Victoria Island", Lagos.
   - *Sees:* a setup checklist on Home: **Complete hotel and company details** ("Address, RC number, TIN and VAT, for invoices and the guest register"), **Set up rooms** ("Room types and rooms, so you can sell them"), **Set rates** ("Prices for each room type, so you can take bookings"), taxes, payment methods, staff, devices, imports, go-live date.
   - *Behind the scenes:* one transaction creates organization, company and hotel (time zone Africa/Lagos, owned by Kora Hospitality Ltd); she becomes `owner`. Audit events for each. Taxes (#27) come pre-filled from Vento's versioned rules for Lagos: VAT, Lagos consumption tax, and a 10% service charge she confirms. She doesn't type any rates.

1b. **10:10 · Complete the hotel and company.**
   - *Does:* she clicks **Complete** on the checklist. Kora Victoria Island is her only hotel, so **Settings › Hotels** (#25) opens its settings with "Add Kora Victoria Island's address. Registration cards, invoices and guest messages use it." She types Plot 1412 Ahmadu Bello Way and Victoria Island, picks Lagos then Eti-Osa, and clicks **Save changes**. She clicks **Upload** under the logo and picks `kora-logo.png`. Under Owning company it says "Kora Hospitality Ltd · RC number and TIN missing"; **Edit company** opens a side sheet where she types RC 1184402 and TIN 21847390-0001, sets VAT registered to Yes and clicks **Save company**.
   - *Sees:* "Kora Victoria Island saved", "Logo saved", "Kora Hospitality Ltd saved". The checklist step ticks.
   - *Behind the scenes:* each save sends the version it started from, so it never overwrites someone else's. The logo goes straight to object storage through a 5-minute signed link and the API checks the real file before using it. Audit events `property.changed`, `property.logo_changed` and `entity.changed`. The hotel isn't live yet, so nothing reaches the owner's daily report.

1a. *Behind the scenes:* the Vento team switches on the modules Kora has bought (front desk first for the pilot) with `pnpm features on`, recorded in Kora's audit log. Mrs Okafor never sees a switch: modules that are off simply aren't in Vento.
2. **10:20 · Invite Tunde and grant support access.**
   - *Does:* Settings → Members → invites Tunde Bello as `general_manager`, limited to Kora Victoria Island. Then Account and support (#46) → "Give Vento support access" for 7 days.
   - *Sees:* "Support can view and help set up this account until 19 Nov 2026, 10:21. Revoke anytime."
   - *Behind the scenes:* consent recorded with who, scope and expiry; every support action is an audit event naming the specialist. The `general_manager` role includes **Set up room types and rooms** (`rooms.setup`), so Tunde can do step 3 without being able to invite or change staff (that stays with `setup.manage`).

3. **Fri 13 Nov, 09:30 · Rooms, floor by floor.**
   - *Does:* Tunde, with the specialist on a call, clicks **Set up** beside **Set up rooms** on Home. Rooms (#33, under Rates & channels) is empty, so the page is the builder (#19 layout): "Describe the pattern once; Vento numbers every room." Under **Room types** he types four lines, each with name, bed and max guests: Standard Queen (Queen, 2), Deluxe King (King, 2), Executive King (King, 2), Junior Suite (King, sofa bed, 3). Vento suggests the codes `STQ`, `DLK`, `EXK` and `JNS`; he changes the last to `JRS`, the code the old PMS uses. Under **Rooms** he adds one line per block, "room type · floors · numbers on each floor":
     - Standard Queen · 3 to 3 · 01 to 14
     - Deluxe King · 4 to 4 · 01 to 14
     - Executive King · 5 to 6 · 01 to 14
     - Standard Queen · 7 to 7 · 01 to 14
     - Standard Queen · 8 to 8 · 01 to 08
     - Deluxe King · 8 to 8 · 09 to 14
     - Deluxe King · 9 to 10 · 01 to 14
     - Junior Suite · 11 to 11 · 01 to 08
   - *Sees:* the **Preview** fills in as he types, floor by floor, one chip per room coloured by its type, with "Standard Queen 36 · Deluxe King 48 · Executive King 28 · Junior Suite 8". He first typed the second floor-8 line as 08 to 14; room 808 was flagged in the preview and the bar read "1 room in two lines. Change one of them.", with **Create** disabled until he fixed it. Then the bar reads "120 rooms on 9 floors". He clicks **Create 120 rooms**. Toast: "120 rooms created at Kora Victoria Island." The page becomes "Rooms · Setting up · Kora Victoria Island · 120 rooms · 4 types" with the room types table and the rooms table. Main path: 2 clicks after typing.
   - *Behind the scenes:* the four room types are saved first, then all 120 rooms in one transaction: all or none. Room numbers are unique in the hotel by a database constraint, archived rooms included. New rooms start `vacant` + `dirty`. Each type's room count comes from its rooms, never typed. Audit events `room_type.created` (4) and `room.created` (120, sharing one batch id, so the audit log shows "120 rooms created" as one line), all marked as before go-live.

3a. **10:00 · Room details.**
   - *Does:* in the rooms table he clicks **Edit** on 407: ticks **Accessible**, adds the feature "Roll-in shower", **Save room**. He ticks **Accessible** on 307, 507 and 901 too, and adds the features the old PMS kept in a notes column: 401 City view with **Connecting room** 402; 406 City view; 412 Near lift; 502 Quiet side (the "quiet room" Acme's travel desk always asks for); 1102 Ocean view and Bathtub. Then **Edit** on each room type: sizes 24, 32, 40 and 58 m², 1 child allowed in Deluxe King, Executive King and Junior Suite, and the amenities (AC, Wi-Fi, smart TV, work desk, kettle, safe, minibar, and so on).
   - *Sees:* "Room 407 saved", "Deluxe King saved". 402 shows "connecting 401" without being touched. No reason is asked: the hotel isn't live yet.
   - *Behind the scenes:* `room.changed` and `room_type.changed` with before and after. The connection is stored once and shown on both rooms.

3b. **10:20 · Mark the rooms inspected.**
   - *Sees:* an amber banner above the tables: "All 120 rooms are dirty until someone checks them. Mark them inspected if they're ready."
   - *Does:* the hotel is trading and Grace's team keeps the rooms ready, so Tunde clicks **Mark 120 inspected** (1 click). Toast: "120 rooms marked inspected · Undo".
   - *Behind the scenes:* one `room.status_changed` per room, `dirty` → `inspected`, reason "Set up". The banner shows only while every room is dirty and none has had a stay; from then on room status belongs to the front desk and housekeeping. Before go-live, nothing in rooms setup raises an exception. After go-live (17 Nov), removing a room, restoring one or changing its type asks for a reason ("Recorded with your name.") and appears in the owner's daily report as "Room count changed".

4. **10:15 · Rate plans (by hand).**
   - *Does:* **Set rates** on the checklist opens the first-rate table: Tunde types the four weekday prices (₦120,000 / ₦150,000 / ₦210,000 / ₦320,000), leaves Fri and Sat as 'same', keeps 'Also create a Bed & breakfast plan at +₦18,000' and clicks **Create Best available**. He adds Non-refundable (Best available − 10%, non-refundable, full stay at booking), fills Best available's cancellation and deposit, and enters the Festive season in the Rate calendar. Acme's two contract plans are created as Corporate accounts only.
   - *Sees:* derived plans marked with a link icon; changing Best available moves Bed & breakfast and Non-refundable.
   - *Behind the scenes:* audit events `rate_plan.created` and `rates.dates_changed`; nothing reaches the owner's report before go-live.

5. **11:00 · Guests, with duplicates.**
   - *Does:* uploads 3,412 guest rows from the old PMS.
   - *Sees:* 27 invalid rows ("Row 806: phone `0803 12` is too short", "Row 1,214: ID number given without ID type"). He skips them; they download as an Excel file with an `errors` column. Apply: 3,385 guests. Then "41 possible duplicates" opens #41: e.g. "Daniel Mensah" and "D. Mensah", same phone `+233…`. He keeps the full name and both emails, and merges.
   - *Behind the scenes:* ID numbers encrypted on write. Duplicates are flagged on phone or email, never merged automatically. Each merge is an audit event and can be undone. The uploaded file and the raw rows are purged after the undo window (NDPA).

6. **12:00 · Corporate accounts.**
   - *Does:* imports 18 companies, including Acme Energy Ltd: credit limit ₦15,000,000.00, 30-day terms, Corporate rates at Kora Victoria Island: Executive King ₦180,000.00 room only, Deluxe King ₦130,000.00 including breakfast.
   - *Sees:* all valid.

7. **14:00 · City ledger opening balances (owner only).**
   - *Does:* Mrs Okafor uploads 31 unpaid invoices for Kora Hospitality Ltd from the old system, as of 16 Nov.
   - *Sees:* preview total ₦29,610,000.00. Acme: 2 invoices, ₦14,400,000.00. She applies.
   - *Behind the scenes:* posted as dated opening entries (source `opening_balance`) with the original invoice dates, so ageing is right from day one.

8. **16:40 · Undo a bad import.**
   - *Does:* she looks at Acme and knows they owe about ₦6M, not ₦14.4M. The old export had "invoice total" next to "outstanding" and the file used the wrong one. She opens the job → "Undo", reason "Used invoice totals instead of outstanding amounts".
   - *Sees:* "Undo available until 14 Nov 2026, 14:05. Nothing depends on these rows." After confirming: "31 opening balances reversed." She re-uploads the corrected file: Acme ₦3,720,000.00 (12 Oct 2026) and ₦2,160,000.00 (2 Nov 2026), total ₦5,880,000.00.
   - *Behind the scenes:* undo runs in one transaction and creates reversing entries; nothing is deleted. A second opening balance job is accepted only because the first was undone. Audit events `import.undone` and `import.applied` with her name and reason.

9. **Sat 14 Nov · Future reservations with deposits.**
   - *Does:* Tunde imports 418 future reservations (arrivals 16 Nov 2026 to 28 Feb 2027) with deposits, including Mr Mensah's Acme booking for 25–28 Nov.
   - *Sees:* 417 applied, 1 conflict: "Row 147 · Junior Suite · 4–6 Dec 2026 · Junior Suite is full on 4 Dec (8 of 8). Not imported." Deposits held: ₦24,780,000.00 across 188 reservations.
   - *Behind the scenes:* each row goes through the booking service with the inventory lock per room type and date; the overbooking limit is 0, so the old PMS's double booking is refused, never moved to another type. Deposits are recorded as deposits held with method, reference and original date, marked opening. One ARI push after the job.
   - *Does:* Tunde calls the guest on row 147, who accepts an Executive King for 4–6 Dec. He changes the room type in the file and re-uploads; the other 417 rows report "already exists" and only row 147 is applied.

10. **Sat 14 Nov, 15:00 · Devices.**
    - *Does:* at the hotel, Tunde registers each device in Settings → Devices (#25): front desk PC 1 and PC 2, Calabash POS tablet, Pool bar tablet, room service tablet, housekeeping phones 1–3.
    - *Sees:* each device listed with its name, property Kora Victoria Island, shared or personal, last seen.
    - *Behind the scenes:* devices bound to Kora Victoria Island and revocable. Each caches the PIN hashes of members allowed at the property.

11. **15:30 · Staff and PINs.**
    - *Does:* invites Chiamaka and Ibrahim (`front_desk`), Grace (`housekeeping_supervisor`), Blessing (`room_attendant`), Femi (`fnb_manager`), Halima (`cashier`), Emeka (`waiter`), all limited to Kora Victoria Island. Each opens the invite email, sets a name and password in one step, and lands on Kora Victoria Island, then sets a 4-digit staff PIN from the account menu. From then on they tap their name on the shared devices and enter their PIN.
    - *Sees:* in Permissions and limits (#26) he reads the defaults (front desk discount ≤ 10%, refund ≤ ₦100,000 for GM, and so on) and leaves them as they are. Only the owner can change them.

12. **Mon 16 Nov · Parallel run.**
    - *Does:* Chiamaka and the evening agent do every check-in, payment and check-out in both systems. Before the day starts, Tunde runs a top-up import of bookings taken since Saturday; existing source references are skipped.
    - *Sees:* at 22:00 Tunde opens the comparison: in-house 74 vs 75, room revenue and deposits held. The difference is a 15:10 walk-in entered only in the old PMS. Chiamaka enters it in Vento; the numbers match.
    - *Behind the scenes:* business date 16 Nov is Vento's first business date.

13. **Tue 17 Nov, 01:00 · Go-live at night audit.**
    - *Does:* Ibrahim runs the old PMS's last night audit, then Vento's first (#15) for 16 Nov.
    - *Sees:* pre-checks, room and tax charges for 75 rooms, reports, "Business date is now 17 Nov 2026". Tunde sets the old PMS to read-only.
    - *Behind the scenes:* ledger opening balances for Kora Hospitality Ltd (entered by Mrs Okafor, must balance or the job fails) are dated 16 Nov. The first owner's daily report goes out at the usual time.

14. **Tue 17 – Mon 23 Nov · First-week check-ins.**
    - *Does:* Tunde and the specialist talk for 15 minutes each morning.
    - Day 1: 14 transfers waiting in the matching queue; they show Tunde how to match against the bank statement.
    - Day 2: Chiamaka didn't know where to post laundry; ⌘K "Post charge" answers it.
    - Day 3 (Thu 19 Nov): support access expires at 10:21; Mrs Okafor extends it by 3 days.
    - Day 7: deposits held report matches the old PMS's last list; Tunde ticks the last item on the setup checklist.

## What can go wrong
- **Two people adding rooms at once:** if the specialist and Tunde both create 412, the second sees "Room 412 already exists." and nothing from that batch is saved. In the builder, numbers that already exist show struck through ("Room 412 already exists, so it's skipped.") and are never overwritten.
- **Someone else tries to set up rooms:** a front desk agent who opens Rooms sees "Only a GM or the owner can set up rooms. Ask your GM." The server refuses the request whatever the screen shows.
- **Connection drops mid-setup:** the page shows the rooms already saved, the buttons say "Needs a connection", and nothing is queued. A **Create** that didn't reach the server created nothing.
- **Rooms from the old PMS file instead of by hand** (the room import, a later Stage 1 brick): the same rules by row, e.g. "Row 41: room 412 appears twice" and "Row 58: room type `EXEC` doesn't exist. Did you mean `EXK`?". Numbering the builder can't express (`A101`) comes in this way or one room at a time with **Add room**.
- **Wrong scope in the file:** a column naming Kora Abuja is an error, not a switch of property.
- **Ambiguous dates:** "03/04/2026" is rejected with "Use 25/11/2026 or 2026-11-25", never guessed.
- **Money with float noise:** "125000.0000001" from Excel is an error; amounts are read from the cell text.
- **Undo after 24 hours:** "Undo is no longer available (applied 13 Nov, 14:05). Post a correction instead." Finance or owner posts corrections.
- **Undo blocked:** if a front desk agent had already settled against an imported Acme invoice, undo lists the blocking rows and does nothing.
- **Import while the desk is booking:** a front desk booking that takes the last Junior Suite during the import wins or loses under the same lock; the import never exceeds the limit.
- **Unbalanced ledger opening file:** "Debits ₦… and credits ₦… don't match for Kora Hospitality Ltd. Put the difference on an account you choose." Nothing is applied.
- **Device stolen during the week:** Tunde revokes it; its queued commands are rejected and listed for him.
- **Support access expires mid-task:** the specialist's session ends; nothing they started is half-applied, because each batch is one transaction.

- **Hotel name already taken:** "Kora Lekki is already a hotel in this group." If the name belongs to an archived hotel: "Kora Port Harcourt is archived. Restore it, or use another name."
- **Company archived while the hotel sheet was open:** "Kora PH Ltd was archived. Choose another company."
- **Two people editing the same hotel:** the second save says "Tunde changed Kora Victoria Island at 14:02. Reload to see the change, then save again." Nothing is overwritten.

## Later: opening Kora Lekki
The group now has four hotels and "All hotels" is selected in the top bar.
1. *Does:* Mrs Okafor opens **Settings › Hotels**, which lists the 4 hotels, and clicks **Add a hotel**. In the side sheet: Name `Kora Lekki`; Owning company (Kora Hospitality Ltd, already chosen as the company that owns the most hotels); Street `Plot 7 Admiralty Way`; Area `Lekki Phase 1`; State `Lagos`; LGA `Eti-Osa`; check-in 14:00 and check-out 12:00 already filled. She clicks **Add hotel**.
2. *Sees:* the sheet closes, the top bar switches to Kora Lekki, and its settings open with "Kora Lekki added" and **Next steps for Kora Lekki**: **Set up rooms**, **Invite the team**, **Register devices**. **Invite the team** opens Members with the invite already limited to Kora Lekki.
3. *Sees, with Kora Lekki selected:* **Members and roles** shows only Adaeze and Kunle (each marked **Whole group**) and "Nobody works only at Kora Lekki yet. Invite its managers and staff." until its GM joins; **Devices** says "No shared devices at Kora Lekki yet". Choosing **All hotels** shows everyone and every device again, each with its hotel.
4. *Behind the scenes:* one transaction creates the hotel and its audit event; its business date is the calendar date in Lagos. Everyone with whole-group access sees it in their hotel switch; people limited to other hotels don't until someone gives them access.

If a hotel later closes, **Archive hotel** at the foot of its settings shows what happens ("Its 72 rooms, history and reports are kept. 3 devices are signed out and revoked.") and asks for a reason; the hotel leaves the switch and waits under **Archived** with **Restore**.

## Targets
- Organization, entity and property created: under 10 minutes.
- 4 room types and 120 rooms by hand: under 10 minutes; one block of rooms on a floor in under 1 minute and 2 clicks after typing.
- Each import: template download to preview in under 3 minutes for a 3,000-row file; progress shown for large files.
- Every error points to a row and a column in plain words.
- Whole setup to parallel run: within 3 working days with Vento's help.
- Zero overbooked dates and zero unbalanced opening entries at go-live.

## Becomes tests
`apps/web/e2e/journeys/going-live.spec.ts`
- Onboarding creates organization, entity and property in one go; the creator is `owner`; audit events exist.
- Completing the hotel's address and the company's RC number and TIN ticks the checklist step; an added hotel appears in the hotel switch and the switch moves to it; archiving a hotel revokes its devices; a GM edits only the check-in and check-out times (`apps/web/e2e/hotels.spec.ts`).
- Members and Devices follow the hotel switch, and Home's per-hotel people and device counts match them (`apps/web/e2e/hotel-switch.spec.ts`, `apps/api/src/tenancy/hotel-switch.test.ts`).
- Tunde (GM, `rooms.setup`) creates the 4 room types (`STQ`, `DLK`, `EXK`, `JRS`) and 120 rooms with the builder in one transaction; the per-type counts are 36 / 48 / 28 / 8; a room in two lines keeps **Create** disabled; a front desk member is refused by the server.
- **Mark 120 inspected** writes one `room.status_changed` per room with reason "Set up" and can be undone; before go-live no reason is asked and no exception is raised.
- Room import (later Stage 1 brick) reports duplicate room numbers and unknown room type codes by row; corrected file applies 120 rooms.
- Guest import skips invalid rows, flags duplicates on phone without merging; merge on #41 combines history and is undoable.
- City ledger opening balances require owner or finance; undo within 24 hours creates reversals; a second job is refused until the first is undone; ageing uses original invoice dates.
- Future reservation import with one over-capacity row reports a conflict with room type and date, applies the rest, and never exceeds the overbooking limit; re-import is idempotent by source reference.
- Deposits from the import appear in the deposits held report with an opening marker.
- Device registration binds to the property; a revoked device's queued commands are rejected.
- Invited staff set a PIN and sign in on a shared device; default limits from the matrix apply.
- First night audit rolls the business date from 16 to 17 Nov; ledger opening balances balance.

## Open questions
- *Settled (rate plans spec, Open question 17):* rate plans come in with the brick 17 import (code, name, room types, meal plan, standard price per room type, cancellation policy, deposit rule); seasons and date prices are set in the Rate calendar afterwards. Until then plans are created by hand, which takes under 10 minutes.
- **First business date:** what is the property's business date between setup (12 Nov) and go-live (16 Nov), and what date do deposits imported on 14 Nov post on? (The rooms spec walks step 3 on business date 13 Nov, while step 12 calls 16 Nov Vento's first business date.)
- **Room status at the start of the parallel run:** step 3b marks all 120 rooms inspected on 13 Nov, but on 16 Nov about 75 rooms are occupied in the old PMS and some are dirty. How do in-house stays and real room statuses reach Vento before the first check-out? Linked to the folio history question below.
- **Opening balances as-of date** when they're imported days before go-live and change during the parallel run: re-import the difference, or post adjustments?
- **Can Ibrahim's night limit be set at invite?** (Settled: staff set their own PIN from the account menu after joining; a manager can reset it. Decision 0022.)
- Is there a **parallel-run comparison** screen, or does Tunde compare reports by hand?
- Does the old PMS's **folio history** for in-house guests come across, or only balances?
- Who in Vento's team does onboarding, and is it part of the subscription?
- Stage 1 needs corporate accounts and city ledger opening balances to go live, but those modules are stages 4–5. Bring the minimum into stage 1?
- Which legacy PMS export formats are supported first (already an open question in DOMAIN).
