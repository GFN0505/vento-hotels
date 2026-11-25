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
   - *Does:* Mrs Okafor signs up, sets up 2FA, and follows onboarding (#19): organization "Kora Hotels Group" → entity "Kora Hospitality Ltd" (RC number, TIN, VAT registered, base currency NGN) → property "Kora Victoria Island", Victoria Island, Eti-Osa, Lagos, time zone Africa/Lagos, owned by Kora Hospitality Ltd.
   - *Sees:* a setup checklist on home: room types and rooms, rates, taxes, payment methods, staff, devices, imports, go-live date.
   - *Behind the scenes:* one transaction creates organization, entity and property; she becomes `owner`. Audit events for each. Taxes (#27) come pre-filled from Vento's versioned rules for Lagos: VAT, Lagos consumption tax, and a 10% service charge she confirms. She doesn't type any rates.

2. **10:20 · Invite Tunde and grant support access.**
   - *Does:* Settings → Members → invites Tunde Bello as `general_manager`, limited to Kora Victoria Island. Then Account and support (#46) → "Give Vento support access" for 7 days.
   - *Sees:* "Support can view and help set up this account until 19 Nov 2026, 10:21. Revoke anytime."
   - *Behind the scenes:* consent recorded with who, scope and expiry; every support action is an audit event naming the specialist.

3. **Fri 13 Nov, 09:30 · Rooms.**
   - *Does:* Tunde and the specialist (on a call) download the room types and rooms templates (#23), paste from the old PMS export, upload.
   - *Sees:* preview: 4 room types (Standard Queen, Deluxe King, Executive King, Junior Suite), 120 rooms (Standard Queen on floor 3, Deluxe King on 4, Executive King on 5 and 6, Junior Suite on 11, and the floors between). Two errors: "Row 41: room 412 appears twice" and "Row 58: room type `EXEC` doesn't exist. Did you mean `EXK`?" He fixes in Excel and re-uploads.
   - *Behind the scenes:* job `uploaded → validated → previewed → applied`; rooms created through the same service as the UI.

4. **10:15 · Rate plans (by hand).**
   - *Does:* there is no rate plan import, so the specialist creates them in #33 with Tunde: BAR (Standard Queen ₦120,000.00, Deluxe King ₦150,000.00, Executive King ₦210,000.00, Junior Suite ₦320,000.00 per night, room only), BAR Bed & Breakfast, Non-refundable (BAR − 10%, derived), Corporate.
   - *Sees:* derived plans shown linked to BAR; changing BAR updates Non-refundable.

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
   - *Sees:* 417 applied, 1 conflict: "Row 147 · Junior Suite · 4–6 Dec 2026 · Junior Suite is full on 4 Dec (2 of 2). Not imported." Deposits held: ₦24,780,000.00 across 188 reservations.
   - *Behind the scenes:* each row goes through the booking service with the inventory lock per room type and date; the overbooking limit is 0, so the old PMS's double booking is refused, never moved to another type. Deposits are recorded as deposits held with method, reference and original date, marked opening. One ARI push after the job.
   - *Does:* Tunde calls the guest on row 147, who accepts an Executive King for 4–6 Dec. He changes the room type in the file and re-uploads; the other 417 rows report "already exists" and only row 147 is applied.

10. **Sat 14 Nov, 15:00 · Devices.**
    - *Does:* at the hotel, Tunde registers each device in Settings → Devices (#25): front desk PC 1 and PC 2, Calabash POS tablet, Pool bar tablet, room service tablet, housekeeping phones 1–3.
    - *Sees:* each device listed with its name, property Kora Victoria Island, shared or personal, last seen.
    - *Behind the scenes:* devices bound to Kora Victoria Island and revocable. Each caches the PIN hashes of members allowed at the property.

11. **15:30 · Staff and PINs.**
    - *Does:* invites Chiamaka and Ibrahim (`front_desk`), Grace (`housekeeping_supervisor`), Blessing (`room_attendant`), Femi (`fnb_manager`), Halima (`cashier`), Emeka (`waiter`), all limited to Kora Victoria Island. Each accepts the invite and sets a 4-digit PIN on a registered device.
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
- **Wrong scope in the file:** a column naming Kora Abuja is an error, not a switch of property.
- **Ambiguous dates:** "03/04/2026" is rejected with "Use 25/11/2026 or 2026-11-25", never guessed.
- **Money with float noise:** "125000.0000001" from Excel is an error; amounts are read from the cell text.
- **Undo after 24 hours:** "Undo is no longer available (applied 13 Nov, 14:05). Post a correction instead." Finance or owner posts corrections.
- **Undo blocked:** if a front desk agent had already settled against an imported Acme invoice, undo lists the blocking rows and does nothing.
- **Import while the desk is booking:** a front desk booking that takes the last Junior Suite during the import wins or loses under the same lock; the import never exceeds the limit.
- **Unbalanced ledger opening file:** "Debits ₦… and credits ₦… don't match for Kora Hospitality Ltd. Put the difference on an account you choose." Nothing is applied.
- **Device stolen during the week:** Tunde revokes it; its queued commands are rejected and listed for him.
- **Support access expires mid-task:** the specialist's session ends; nothing they started is half-applied, because each batch is one transaction.

## Targets
- Organization, entity and property created: under 10 minutes.
- Each import: template download to preview in under 3 minutes for a 3,000-row file; progress shown for large files.
- Every error points to a row and a column in plain words.
- Whole setup to parallel run: within 3 working days with Vento's help.
- Zero overbooked dates and zero unbalanced opening entries at go-live.

## Becomes tests
`apps/web/e2e/journeys/going-live.spec.ts`
- Onboarding creates organization, entity and property in one go; the creator is `owner`; audit events exist.
- Room import reports duplicate room numbers and unknown room type codes by row; corrected file applies 120 rooms.
- Guest import skips invalid rows, flags duplicates on phone without merging; merge on #41 combines history and is undoable.
- City ledger opening balances require owner or finance; undo within 24 hours creates reversals; a second job is refused until the first is undone; ageing uses original invoice dates.
- Future reservation import with one over-capacity row reports a conflict with room type and date, applies the rest, and never exceeds the overbooking limit; re-import is idempotent by source reference.
- Deposits from the import appear in the deposits held report with an opening marker.
- Device registration binds to the property; a revoked device's queued commands are rejected.
- Invited staff set a PIN and sign in on a shared device; default limits from the matrix apply.
- First night audit rolls the business date from 16 to 17 Nov; ledger opening balances balance.

## Open questions
- **Rate plans aren't an import kind** in the data-import rules, yet corporate account rows need rate plans to exist. Add a rate plan import, or keep them manual?
- **First business date:** what is the property's business date between setup (12 Nov) and go-live (16 Nov), and what date do deposits imported on 14 Nov post on?
- **Opening balances as-of date** when they're imported days before go-live and change during the parallel run: re-import the difference, or post adjustments?
- **How do staff set PINs:** on first sign-in on a registered device, or set by the manager? Can Ibrahim's night limit be set at invite?
- Is there a **parallel-run comparison** screen, or does Tunde compare reports by hand?
- Does the old PMS's **folio history** for in-house guests come across, or only balances?
- Who in Vento's team does onboarding, and is it part of the subscription?
- Stage 1 needs corporate accounts and city ledger opening balances to go live, but those modules are stages 4–5. Bring the minimum into stage 1?
- Which legacy PMS export formats are supported first (already an open question in DOMAIN).
