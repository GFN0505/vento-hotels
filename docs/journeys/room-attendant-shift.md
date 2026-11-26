# Room attendant's shift

## Who, goal, device, stage
- **Who:** Blessing Udo (room attendant, `room_attendant`), with Grace Akpan (housekeeping supervisor, `housekeeping_supervisor`). Tunde Bello (GM) and Chiamaka Eze (front desk, morning) see the results.
- **Goal:** clean her rooms on floors 4 and 5 in the right order, record what she finds (minibar, faults, lost property, room checks), and get rooms to `inspected` fast enough for an early arrival.
- **Device:** a shared housekeeping phone (mid-range Android) registered to Kora Victoria Island. Grace uses a second shared phone. Chiamaka is on the front desk PC.
- **Stage:** 2 (Housekeeping & maintenance).
- **Screens:** 22 (shared device sign-in), 12 (housekeeping board and attendant view, supervisor inspection), 39 (room checks, discrepancy alert, lost and found), 13 (maintenance work orders), 30 (arrivals with room readiness), 20 (leakage: room discrepancy alert), 29 (notifications), 36 (sync queue), 28 (audit drawer on a room).

**Setting:** Wednesday 25 Nov 2026, Kora Victoria Island, business date 25 Nov 2026. Shift 07:00–15:00. Grace assigned the day's rooms on the board (screen 12) at 06:45. Blessing has 8 rooms on floors 4 and 5 (Deluxe King on 4, Executive King on 5).

| Room | Front office | Housekeeping | Why it is where it is |
|---|---|---|---|
| 502 | vacant (checked out 07:40) | dirty | Departure (Acme Energy guest); Mr Daniel Mensah (Acme Energy Ltd) arrives early, ETA 11:30 |
| 404 | vacant (checked out 07:10) | dirty | Departure |
| 504 | occupied, due out 12:00 | dirty | Departure, guest not yet left |
| 405 | occupied | dirty | Stayover, guest flagged VIP |
| 402 | occupied | dirty | Stayover |
| 503 | occupied | dirty | Stayover |
| 401 | occupied | dirty | Stayover |
| 403 | vacant | dirty | Departure from yesterday, not turned |

## The walkthrough

1. **PIN sign-in (07:02).**
   - *Does:* picks up the housekeeping phone, taps her avatar on the lock screen, enters her 4-digit PIN.
   - *Sees:* "My rooms · 8" for floors 4 and 5, with the time and "Kora Victoria Island".
   - *Behind the scenes:* the PIN is checked against the cached salted hash on the device (screen 22); nothing is sent. A `member.signed_in` audit event records Blessing, the device and the property. Reference data (her assignment, room statuses, minibar price list) is already cached for offline use.

2. **Her rooms in order.**
   - *Does:* reads the list.
   - *Sees:* 502 at the top with an "Early arrival 11:30" tag, then 404, 403, 504 ("Due out 12:00 · guest still in"), then stayovers with 405 first ("VIP"), then 402, 503, 401. Each row shows room, type, front office status, housekeeping status and any guest note ("Extra pillows" on 405).
   - *Behind the scenes:* ordering is departures first, then stayovers; within each group, early arrivals and VIPs move up; departures not yet vacated drop below vacated ones. The order is computed on the server and cached; it does not change under her thumb while she is working a room.

3. **Start room 502 (07:05).**
   - *Does:* taps 502, then **Start**.
   - *Sees:* the checklist for an Executive King departure (strip bed, bathroom, restock amenities, minibar check, AC and lights check, floor) and a running timer.
   - *Behind the scenes:* assignment status `pending → in_progress`; Grace's board shows 502 "In progress · Blessing". Audit event with device and time.

4. **Checklist and Done (07:38).**
   - *Does:* ticks each item, taps **Done**.
   - *Sees:* "Room 502 · clean · waiting for inspection". Next room 404 opens.
   - *Behind the scenes:* housekeeping status `dirty → clean`, assignment `in_progress → done`. Grace gets a notification that 502 is ready to inspect and flagged for an early arrival. Front desk still sees 502 as "Clean, not inspected", so it is not yet offered first for check-in.

5. **Minibar in a stayover (09:15, room 405).**
   - *Does:* in 405, opens **Minibar**, taps Coca-Cola ×2 (₦2,500 each) and Cashew nuts ×1 (₦5,000).
   - *Sees:* "Post ₦10,000.00 + tax to room 405" and, after tapping, "Posted to room 405".
   - *Behind the scenes:* one command creates a minibar charge on the in-house guest's folio for business date 25 Nov 2026, department `beverage` (or `other_operated`, per configuration), with VAT, Lagos consumption tax and service charge as separate tax lines from configuration. Stock is deducted from the housekeeping store. If the stay has routing, the charge follows it (extras normally stay on the guest folio). Audit event names Blessing.

6. **Reports an AC fault (09:50, room 503).**
   - *Does:* in 503, taps **Report a fault**, picks "AC", "Not cooling", takes a photo of the unit display, taps **Send**.
   - *Sees:* "Work order created · Room 503 · AC not cooling".
   - *Behind the scenes:* a work order is created `open` with room 503, category, priority (normal by default; the attendant can mark urgent), photo, and Blessing as reporter. Maintenance sees it on the work orders board (screen 13). Chiamaka sees a wrench icon on room 503 in arrivals/in-house (screen 30) and on the room drawer, so she can warn the guest or offer a move. The room stays `occupied` and is not put OOO unless maintenance does so.

7. **10:00 room check: the skipper in 406.**
   - *Does:* at 10:00 the phone shows "Room check due · floor 4". She opens it (screen 39) and walks the floor, tapping **Occupied** or **Vacant** for every room, including rooms not assigned to her. At 406 the bed has been slept in and two towels are used. She taps **Occupied** and adds a photo.
   - *Sees:* "Room check sent · 14 rooms · 1 difference".
   - *Behind the scenes:* the server compares her marks with front office status. Room 406 is `vacant` + `inspected` in the system, found used: a **skipper**. An alert goes to Tunde (GM) at once on the Leakage screen (screen 20) and as a notification: "Room 406 · shown vacant, found used at 10:00 (attendant: Blessing). Resolve with a reason." Blessing's view does not say "skipper" or accuse anyone. The alert stays open until Tunde resolves it with a reason, and appears in tomorrow's owner's daily report either way.

8. **Lost and found (10:40, room 403).**
   - *Does:* cleaning 403 (yesterday's departure), she finds a silver wristwatch in the bedside drawer. Taps **Lost and found → Add**, takes a photo, types "Silver wristwatch, bedside drawer", picks storage "Housekeeping office, shelf B".
   - *Sees:* item `stored` with its photo, room and time.
   - *Behind the scenes:* lost and found record (found by Blessing, room 403, storage location, status `stored`), linked to the departed stay so front desk can contact the guest. The photo goes to object storage through a signed URL.

9. **Grace inspects (10:50–11:10).**
   - *Does:* on her own shared phone (PIN sign-in), opens **Inspections**. Passes 502 with no notes. Fails 404: "Hair in shower drain. Bath mat missing."
   - *Sees:* 502 "Inspected"; 404 "Failed · back to Blessing".
   - *Behind the scenes:* 502 `clean → inspected`, assignment `done → inspected`. 404 goes back to `dirty` with Grace's notes, and reappears on Blessing's list above stayovers with the notes on top. Both results are audit events naming Grace.

10. **Front desk sees 502 ready (11:10).**
    - *Does:* Chiamaka has Mr Mensah's arrival open.
    - *Sees:* room 502 now "Vacant · inspected" with a green tile; it is the first suggestion in room assignment (screen 6). At 11:35 she checks him in.
    - *Behind the scenes:* the status change reached the front desk through the normal data refresh (target below). Blessing redoes 404 by 11:30; Grace passes it at 11:45.

11. **Power cut (12:10–12:55).**
    - *Does:* the grid drops; the generator takes about a minute and the Wi-Fi router stays down for 45 minutes. Blessing keeps working: Start/Done on 504 (guest left at 11:55) and 402, the checklist, a minibar posting in 402 (Chivita juice ×1, ₦3,000).
    - *Sees:* the offline banner "Offline — changes will sync when you're back online", a sync count "3 waiting", and "Saved on this device" on 504 and 402.
    - *Behind the scenes:* each action is a command in the IndexedDB outbox with a UUID v7, idempotency key, `deviceId`, `memberId` and device time. Allowed offline per the offline-sync skill: room status changes, assignment progress, inspection results, minibar consumption, lost and found. The minibar posting is allowed only because 402's guest is in the cached in-house list. When the router returns at 12:55, the queue flushes in order; the minibar charge posts to business date 25 Nov 2026 (not yet closed). Room status uses last-writer-wins by timestamp.
    - *Blocked offline:* reporting a new fault is not on the skill's offline allow-list, so **Report a fault** is disabled with "Needs a connection. Tell your supervisor or try again when you're back online." (see Open questions). Front desk also cannot see the new statuses until sync.

12. **Device left signed in (13:00).**
    - *Does:* Blessing goes for lunch with the phone on the trolley, still signed in.
    - *Sees (on return):* the lock screen with "Signed out after 2 minutes idle". She signs in again with her PIN at 13:40.
    - *Behind the scenes:* auto sign-out ends her session after the configured idle time; the outbox and cached data stay on the device (they belong to the device and property). Any action taken while she is signed out would need a PIN, so nothing can be done in her name. Sign-out and sign-in are audit events.

13. **End of shift (14:50).**
    - *Does:* finishes 401, taps **End shift**.
    - *Sees:* "8 of 8 done · 7 inspected · 1 waiting", and a warning only if items are still waiting to sync.
    - *Behind the scenes:* assignment summary for the shift (rooms, times, credits per room type) is available to Grace and on the room status report.

## What can go wrong
- **Wrong PIN:** "That PIN didn't match. Try again." After the configured number of tries: "Too many tries. Try again in 5 minutes." The lockout counts locally and syncs.
- **Guest still in a departure room:** 504 shows "Due out 12:00 · guest still in". Tapping Start asks "Guest may still be in the room. Start anyway?" and logs the answer.
- **Do not disturb on a stayover:** she marks "DND" with time; the room moves to the end of the list and Grace sees it.
- **Minibar for a guest who has checked out:** the item goes to the departed stay's folio only if it is still open; otherwise it is recorded as a late charge for the front desk to decide. Offline, it is blocked if the guest is not in the cached in-house list.
- **Inspection fails twice:** the room stays `dirty`; Grace sees a count of failures per attendant on the board.
- **Room check skipped:** if no one submits the 10:00 check by 10:30, Grace and Tunde see "10:00 room check not done · floor 4".
- **Skipper on a room front desk just checked in:** if 406 was checked in between 10:00 and the comparison, the server compares against status at the check time and does not raise a false alert.
- **Sync conflict after the power cut:** if front desk put 402 OOO while Blessing was offline, her `clean` status is kept in history but does not override OOO (server wins on room availability). It shows in the sync queue (screen 36) with plain words.
- **Device revoked mid-shift:** her session ends at next contact; queued commands are rejected and listed for a manager, not applied.
- **Phone battery dies offline:** the outbox is in IndexedDB and survives; it flushes when the phone is charged and back online.

## Targets
- PIN sign-in to "My rooms" in under 3 seconds, offline too.
- Start and Done: 1 tap each. Minibar posting: 3 taps or fewer. Fault report with photo: under 30 seconds.
- Room check: 1 tap per room; a floor of 20 rooms in under 5 minutes of tapping.
- Status change visible to front desk and Grace within 5 seconds when online.
- Skipper alert reaches the GM within 1 minute of the room check being submitted.
- Outbox drains within 30 seconds of reconnecting for a queue of up to 50 commands.
- Works on a 375px-wide screen with one hand; touch targets at least 48px.

## Becomes tests
`apps/web/e2e/journeys/room-attendant-shift.spec.ts`, on the demo seed:
- PIN sign-in on a registered shared device; wrong PIN shows the right copy; audit event `member.signed_in` with device id.
- Room order is 502 (early arrival) first, departures before stayovers, VIP 405 first among stayovers, 504 (still occupied) below vacated departures.
- Start → Done moves 502 to `clean` and the assignment to `done`; the board shows it.
- Minibar posting creates a folio charge on 405 with separate tax lines and business date 25 Nov 2026; stock deducted.
- Fault report creates an `open` work order for 503 visible on the maintenance board and on the front desk room drawer.
- Room check marking 406 occupied while it is `vacant` creates a `skipper` discrepancy and a GM notification; the alert cannot be closed without a reason.
- Grace fails 404 with notes → `dirty` and back on Blessing's list; passes 502 → `inspected`; arrivals shows 502 as ready and first in room assignment.
- Offline (`context.setOffline(true)`): banner shown, Done and minibar queue with "Saved on this device" and a queue count; **Report a fault** is disabled with a reason; back online the queue drains and server state matches.
- Idle for the configured time → lock screen with "Signed out after 2 minutes idle"; outbox still present after the next PIN sign-in.

## Open questions
- **Room order rules:** does a VIP stayover outrank an ordinary departure? Should the attendant be able to reorder her own list?
- **Reporting faults offline:** work orders are not on the offline-sync allow-list. Should `work_order.create` be added (it does not affect availability unless it puts a room OOO)?
- **Photos offline:** lost and found is allowed offline, but the photo needs object storage. Do we queue the image in IndexedDB (size limit, NDPA if it shows a guest's belongings with ID) and upload later?
- **Room checks offline:** are room check results "room status changes" for the allow-list, and is a discrepancy computed at sync against status at the check time?
- **Permissions for housekeeping roles:** the matrix in `DOMAIN.md` has no rows for minibar posting, lost and found, room checks or fault reports. Minibar posting writes to a folio (Finance); confirm a room attendant may do it and whether there is a limit.
- **What the skipper does to 406:** after Blessing marks it used, should 406 move to `dirty` automatically, or stay `inspected` until Tunde resolves the alert?
- **Assignment status on inspection fail:** `DOMAIN.md` says fail → `dirty` for the room, but assignment status only goes `pending → in_progress → done → inspected`. Does a failed inspection reset the assignment to `pending` or add a `failed` state?
- **Auto sign-out time:** the demo world uses 2 minutes for housekeeping phones and 90 seconds for POS; are these defaults configurable per property?
- **Minibar department and stock:** `beverage` or a separate minibar revenue code; which store the stock comes from.
