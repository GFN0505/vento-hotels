# Room types and rooms

- **Status:** approved (owner, 2026-11-26)
- **Stage:** 1 (brick 1 of the plan in [stage-1-plan.md](stage-1-plan.md))
- **Module:** Reservations & Front Desk (property setup)
- **Walkthroughs:** `going-live.md` step 3 (changed: rooms by hand with "Add rooms by floor", the import stays for brick 17); the setup checklist on Home (`OnbHome`). Every later Stage 1 walkthrough step that names a room (`front-desk-morning.md`, `night-audit.md`, `00-golden-thread.md`) depends on the seed below.
- **Screens:** Room types and rooms (#33, `RoomsManage.dc.html`, `RoomsManageM.dc.html`, view `rooms` of `RoomsRates.dc.html` with its loading, empty, error and offline states), onboarding rooms step (#19, `OnbRooms.dc.html`, used as the "Add rooms by floor" sheet and the empty state), Home setup checklist (`OnbHome.dc.html`), audit trail on a room (`AuditOnRoom.dc.html`, drawer only).
- **Decisions:** `0007-availability-locking-and-ota-overbookings.md` (what this brick prepares for), `0021-feature-switches.md` (gated by `front_desk`). No new decision record needed.

## Problem
A hotel can't sell, assign or count a room Vento doesn't know about. Today a GM setting up Kora Victoria Island has nowhere to say "we have 120 rooms in four types, on these floors", and every later Stage 1 brick (rates, availability, the tape chart, check-in, night audit, occupancy) needs that list to be right, complete and hard to quietly change. Typing 120 rooms one by one is the kind of setup chore that makes hotels give up on new software.

## Persona and job
- **GM** (Tunde Bello, laptop, at setup and a few times a year after): describe the hotel's room types and rooms once, quickly, then fix the odd room (a renumbered door, a room converted to a store, a new accessible room).
- **Owner or group admin** (Mrs Adaeze Okafor): same, for any hotel in the group; sees in the owner's daily report when a live hotel's room count changes.
- **Everyone else** only reads this data through other screens (tape chart, check-in, room board). This page is a setup page.

## Success looks like
- Kora Victoria Island's 4 room types and 120 rooms set up by hand in under 10 minutes; a single-type block like "101–120 on floor 1, Deluxe King" in under 1 minute and 2 clicks after typing.
- No duplicate room numbers in a hotel, ever (proved by a concurrent-create test).
- The count of sellable rooms per type is always derived from the rooms themselves, never typed, so availability (brick 4) can't drift from the physical hotel.
- After go-live, any change that reduces or moves sellable rooms (archive, change type) carries a name and reason and shows in the next owner's daily report.

## User flow
Tunde, GM at Kora Victoria Island, business date 13 Nov 2026 (setup week, `going-live.md` step 3).

1. Home shows the setup checklist step **Set up rooms** ("Room types and rooms, so you can sell them"). He clicks it and lands on **Rooms**, which is empty and opens straight into the builder (the `OnbRooms` layout): "Describe the pattern once; Vento numbers every room."
2. Under **Room types** he types four lines: Standard Queen (Queen), Deluxe King (King), Executive King (King), Junior Suite (King + sofa bed), each with its max adults. Each line gets a code suggested from the name (he changes Junior Suite's suggested `JNS` to `JRS`). Children and sizes are added afterwards in each type's **Edit**, as built.
3. Under **Rooms** he adds lines of "type · floors · numbers on each floor": Standard Queen · floors 3–3 · 01–14; Deluxe King · 4–4 · 01–14; Executive King · 5–6 · 01–14; and so on (the full seed layout is below).
4. The **preview grid** shows every room as a chip coloured by type, floor by floor, with a legend ("Standard Queen 36 · Deluxe King 48 · Executive King 28 · Junior Suite 8"). He clicks chip 1008 and changes it to Deluxe King. Clashes are marked before anything is saved.
5. He clicks **Create 120 rooms** (main path: 2 clicks after typing, plus any chip fixes). Toast: "120 rooms created at Kora Victoria Island."
6. Rooms now shows the design's page: header "Rooms · Kora Victoria Island · 120 rooms · 4 types", the room types table and the rooms table. A banner: "All 120 rooms are dirty until someone checks them. Mark them inspected if they're ready." → **Mark 120 inspected** (1 click, undo toast).
7. Later he opens room 407 (**Edit**, side sheet), ticks **Accessible**, adds the feature "Roll-in shower", and sets **Connecting room** on 401 to 402 (402 shows "connecting 401" too). Saves (3 clicks).
8. He fills in the room type details he skipped: Deluxe King → **Edit**: size 32 m², base occupancy 2, max adults 2, max children 1, amenities (AC, Wi-Fi, smart TV, work desk, kettle, safe, minibar). He drags Junior Suite to the bottom of the list; the tape chart and every picker will follow that order.

Adding one room later: **Add room** in the rooms table header → number, floor, type → **Add room** (3 clicks after typing). Adding a whole new block later uses **Add rooms by floor**, the same builder as step 3 in a sheet.

## Acceptance criteria

### Main path
**Room types** (per property)
- Fields: name (required, unique in the hotel, up to 60 characters), code (required, 2–6 capital letters or digits, unique in the hotel, suggested from the name, used by imports and later channel mapping), bed (King, Queen, Double, Twin, Single) plus a "Sofa bed" tick, base occupancy (guests included in the price, default 2), max adults (default 2), max children (default 0), size in m² (optional), amenities (chips from a short suggested list plus the hotel's own), sort order (drag, or move up/down with the keyboard).
- "Max guests" shown in the table is max adults + max children. A lower total cap (e.g. "3 people, but never 3 adults") is out of scope; see Open questions.
- The **Rooms** column counts active rooms of the type and is never typed.
- The design's **Base rate** column appears with rate plans (brick 2) and **Sold on** with channels (Stage 4). Until then they aren't shown (logged in `docs/design/CHANGES.md` by the frontend).
- Room types can be added from the builder (empty state), from **Add room type**, or inline in **Add rooms by floor**.

**Rooms** (per property)
- Fields: number (required, up to 10 letters, digits or hyphens, e.g. `412`, `G01`, `PH-2`; unique among the hotel's rooms including archived ones), floor (whole number, 0 shown as "Ground", minus numbers for basements), room type (required), features (chips: the hotel's own list, with suggestions like City view, Ocean view, Pool view, Near lift, Quiet side, Bathtub, Balcony), accessible (yes/no, shown as a feature and as a filter), connecting rooms (other rooms in the same hotel; setting 401 → 402 also sets 402 → 401; removing it removes both sides).
- New rooms start `vacant` and `dirty` (as in `OnbHome`: nobody sells a room nobody has checked). The **Mark N inspected** banner appears only while every active room is dirty and none has ever had a stay; after that, room status changes belong to the front desk and housekeeping bricks.
- Status column: "In service" (emerald) in this brick. Out of order and out of service, with their dates, arrive with brick 7 (and Stage 2 work orders); the column and the "Out of order" filter chip are built now and simply show nothing until then.
- The rooms table is server-paginated (100 per page), sorted by floor then number (natural sort, so 1101 follows 1014), searchable by number, filterable by type, floor, Accessible and Archived. Select rows to **Change type** or **Remove** in bulk.

**Add rooms by floor** (bulk add)
- One or more lines: room type, floors from–to, numbers on each floor from–to (two digits, 01–99). Room number = floor + the two digits (floor 4, 01 → `401`; floor 11, 01 → `1101`; ground floor → `G01`). A single floor is "from 1 to 1", which covers "rooms 101–120 on floor 1 as Deluxe King".
- The preview grid shows every room before saving; clicking a chip changes its type or leaves it out. Numbers that already exist are shown struck through with "Already exists" and are skipped, never overwritten. Up to 500 rooms per go.
- Everything in one go is one transaction: all rooms are created or none are.
- Numbering schemes the builder can't express (e.g. `A101`) are added one by one or with the import (brick 17).

**Remove, archive, restore**
- **Remove** on a room or room type archives it (CLAUDE.md rule 10). It disappears from the lists, pickers and room counts, stays on old records, and is listed under the Archived filter with **Restore**.
- A room with no history (never on a stay, no postings, no status changes other than setup) can also be **Deleted for good** from the Archived filter, which frees its number. With history, delete isn't offered and the server refuses it.
- An archived room's number can't be reused: "Room 412 is archived. Restore it, or delete it for good if it was a mistake."
- A room type can only be archived when it has no active rooms: "Move or remove the 48 Deluxe King rooms first."
- Forward rules (enforced from the brick that introduces the data): a room with an in-house guest or a future assigned stay can't be archived or change type (brick 4/7); a type with future reservations can't be archived (brick 4); archiving a type stops its rates selling (brick 2).

**Home and navigation**
- Home's setup checklist gains **Set up rooms**, done when the hotel has at least one active room. The hotels table on Home shows each hotel's room count once rooms exist.
- The page opens from the sidebar entry the design puts it under (Rates & channels), from the checklist, and from ⌘K ("Rooms", "Add rooms by floor", "Room 412" opens that room's sheet).

### Organization isolation
- Room types and rooms carry `organizationId` and `propertyId`. Every read and write is filtered by the organization from the auth context; an id from another group answers "not found".

### Property scoping
- Room types and rooms belong to one property; nothing is shared across the group in this brick (copying types from another hotel is out of scope).
- Tunde, limited to Kora Victoria Island, sees and changes only its rooms; a request naming Kora Abuja's room is refused as not found.
- With "All hotels" selected in the top bar, Rooms asks "Rooms are set up per hotel. Pick a hotel." with the hotel list.

### Permissions, limits and approvals
- Needs the **new permission `rooms.setup`** ("Set up room types and rooms"): owner ✓, group admin ✓, general manager ✓ (for their hotels). Nobody else by default; the owner can grant it to another role in Permissions and limits.
- Why not `setup.manage`: that permission also manages people and access. Giving it to GMs so they can add rooms would also let them invite and change staff. The walkthrough has Tunde setting up rooms, so rooms need their own row.
- No limits and no approvals. After go-live, archiving a room, restoring one, or changing a room's type requires a **reason** in the same dialog ("Recorded with your name."). Before go-live (the property's first night audit hasn't run), no reason is asked.
- Reading rooms for other jobs (tape chart, check-in, room board) is covered by those bricks' permissions, not this one.
- The module is gated by the `front_desk` feature switch (decision 0021).

### Audit events
All in the same transaction as the change, with actor, device, property, business date, before/after and reason where given:
- `room_type.created`, `room_type.changed`, `room_type.archived`, `room_type.restored`, `room_types.reordered`
- `room.created` (one per room; bulk adds share a batch id so the audit log can show "120 rooms created" as one line), `room.changed` (number, floor, type, features, accessible, connecting), `room.archived`, `room.restored`, `room.deleted` (no history only)
- `room.status_changed` for **Mark N inspected** (dirty → inspected, reason "Set up").
- The audit drawer on a room (`AuditOnRoom.dc.html`) shows these.

### Leakage exceptions
- **New exception `room_count_changed`**, only after go-live: a room archived, restored, or moved to another type. A room taken out of the count can be sold off the books, and it also flatters occupancy, so the owner sees it. Owner's daily report line: "Room count changed · Room 412 archived · Tunde Bello · Reason: converted to store". Changing features, floor or name raises nothing.
- This brick writes the audit events with two flags in `after`: `roomCountChange: true` on every archive, restore and type change (one room or bulk), and `liveProperty`; the owner's daily report brick (16) turns events with both set into exception rows.

### Offline behaviour
- Setup needs a connection. Offline, the page shows the cached list with the design's banner ("Offline since 17:32. Rooms and plans are read-only offline.") and the add, edit and remove buttons are disabled with "Needs a connection". Nothing is queued.
- The rooms list is cached on the device so the front desk bricks can show rooms offline.

### Business date
- Not used to date room setup: a room added at 15:00 counts from the current business date onwards (brick 4 counts it in that date's inventory). The design's subtitle "changes apply from the next business date" is wrong for rooms and is dropped (logged in `docs/design/CHANGES.md`).
- Audit events record the business date as usual. "Go-live" for the reason and exception rules means the property has completed at least one night audit.

### Tax lines
Not relevant. Tax categories sit on rate plans and revenue codes (brick 2 and 3), not on room types.

### Foreign currency
Not relevant.

### Availability locking
Nothing is sold yet, so nothing is locked in this brick. What it guarantees for brick 4:
- **Inventory per room type per date** will be: active rooms of that type − rooms out of order that date − booked − blocked. The first term comes only from the rooms table, never a typed number.
- Every change to the number of active rooms in a type (create, bulk create, archive, restore, delete, change type) goes through one rooms service function. Brick 4 adds, inside that same transaction, the row lock on that type's inventory for every open date from the business date on, and refuses a change that would leave sold rooms above availability plus the overbooking limit ("Deluxe King would be 1 room short on 26 Nov. Move that booking first.").
- Room numbers are unique per property by a database constraint (archived rooms included), so two people bulk-adding at once can't create the same room twice; the second gets "Room 412 already exists" and nothing from that batch is saved.

### Empty, error and edge cases
- **Empty hotel:** the builder fills the page (empty state *is* the builder), with "Describe the pattern once; Vento numbers every room." and **Create N rooms** disabled until there's at least one room.
- **Types but no rooms:** the room types table shows "0" rooms per type and the rooms card says "No rooms yet. Add them floor by floor, or one at a time." → **Add rooms by floor**.
- **Filtered empty:** "No rooms match these filters." → **Clear filters**.
- **Load error:** design copy "Couldn't load rooms. Nothing changed." → **Try again**.
- **Duplicates inside one bulk line set** (two lines both making 405): flagged on both chips in the preview; **Create** stays disabled until fixed.
- **Floor range upside down** (6 to 5): "That floor is below the first floor." **Numbers 14 to 01**: same pattern.
- **Room type name or code taken:** "Deluxe King already exists at this hotel." / "Code DK is used by Deluxe King."
- **Changing a room type's max guests below what future stays need:** allowed in this brick (no stays); from brick 4, warns with the count of affected future stays and lets the GM continue.
- **Long names** (e.g. "Presidential Suite with Lagoon View") truncate with a tooltip and wrap in the sheet; 500-room hotels page smoothly.
- **Connecting room archived:** the link is removed from both rooms in the same transaction.
- **Room type archived and later restored:** its rooms stay where they were moved; restoring the type doesn't bring rooms back.
- **Changing a room's number** after go-live: allowed with no reason (doors get renumbered); history follows the room's id, and old folios show the number at the time.

## Behind the scenes
- **Folio postings:** none.
- **Night audit:** none in this brick. From brick 13, available room nights for a business date are snapshotted from active rooms (minus OOO) at audit time.
- **Ledger:** none.
- **Jobs:** none. (Channel ARI after room count changes is Stage 4.)
- **Notifications:** none in app. The exception reaches the owner's daily report (brick 16).
- **Data import at go-live:** rooms and room types come in through the import (brick 17, `going-live.md` step 3) using the same service, so the same validations apply: duplicate number, unknown type code ("Room type `EXEC` doesn't exist. Did you mean `EXK`?"), floor not a whole number. Until brick 17, hotels use the builder, which is faster for most layouts anyway.

### Demo seed (Kora Victoria Island)
Matches `RoomsManage`, `TapeChart`, `HKBoard`, `AuditOnRoom` and the walkthroughs. 14 rooms per floor on floors 3–10, 8 suites on floor 11.

| Room type | Code | Bed | Base / adults / children | Size | Rooms |
|---|---|---|---|---|---|
| Standard Queen | `STQ` | Queen | 2 / 2 / 0 | 24 m² | 36: 301–314, 701–714, 801–808 |
| Deluxe King | `DLK` | King | 2 / 2 / 1 | 32 m² | 48: 401–414, 809–814, 901–914, 1001–1014 |
| Executive King | `EXK` | King | 2 / 2 / 1 | 40 m² | 28: 501–514, 601–614 |
| Junior Suite | `JRS` | King + sofa bed | 2 / 3 / 1 | 58 m² | 8: 1101–1108 |

- Features from the designs: 401 City view, connecting 402; 406 City view; 407 Accessible, Roll-in shower; 412 Near lift; 1102 Ocean view, Bathtub; 502 Quiet side (Mr Mensah's "quiet room"). Accessible also on 307, 507 and 901 (the design's "Accessible 4").
- All 120 rooms `vacant` + `inspected` in this brick's seed; later bricks seed stays, the OOO rooms and the 25 Nov statuses on top.
- The other three hotels get the same four types in simple floor blocks with their walkthrough counts (Ikeja GRA 86, Abuja 104, Port Harcourt 72), so the group shows 382 rooms.

### Changes needed in `docs/DOMAIN.md`
1. **Room type** row: "Per property. Name and code (unique in the hotel), bed and sofa bed, base occupancy, max adults and max children, size, amenities, sort order. Room count is derived from active rooms."
2. **Room** row: add "Number unique in the hotel, including archived rooms; floor (0 = Ground); features; accessible; connecting rooms (both ways). New rooms start `vacant` + `dirty`."
3. **Permissions matrix:** new row "Set up room types and rooms" (`rooms.setup`): general_manager ✓, owner / group_admin ✓, others –. Same row in `packages/shared/src/permissions.ts` (Setup group).
4. **Exception** list: add "room count changed (room archived, restored or moved to another type after go-live)".
5. **Go-live** (new term, Tenancy or Data import): "A property is live once its first night audit has completed. Before that, setup changes raise no exceptions."

### Changes needed in walkthroughs (product-manager, same change as the build)
- `going-live.md` step 3: room type codes `STQ`, `DLK`, `EXK`, `JRS`; floors 7–10 mixed as in the seed table; mention **Add rooms by floor** as the by-hand route; after creating, "Mark 120 inspected".
- `journeys/README.md` demo world: add the floor layout and codes from the seed table.

## UI copy
- Page: "Rooms" · "Kora Victoria Island · 120 rooms · 4 types"
- Buttons: "Add room type", "Add rooms by floor", "Add room", "Create 120 rooms", "Save room", "Save room type", "Change type", "Remove", "Restore", "Delete for good", "Mark 120 inspected", "Clear filters", "Try again"
- Builder: "Describe the pattern once; Vento numbers every room." · "Room numbers on each floor" (e.g. 01–14) · "Click a room to change its type or leave it out" · legend "Standard Queen 36 · Deluxe King 48 …"
- Empty: "No rooms yet. Add them floor by floor, or one at a time." · Filtered: "No rooms match these filters."
- Banner: "All 120 rooms are dirty until someone checks them. Mark them inspected if they're ready."
- Toasts: "120 rooms created at Kora Victoria Island" · "Room 407 saved" · "Room 412 removed · Undo" · "120 rooms marked inspected · Undo" · "Deluxe King saved"
- Errors: "Room 412 already exists." · "Room 412 is archived. Restore it, or delete it for good if it was a mistake." · "Deluxe King already exists at this hotel." · "Code DK is used by Deluxe King." · "Move or remove the 48 Deluxe King rooms first." · "That floor is below the first floor." · "Needs a connection"
- Reason (after go-live): "Reason for removing Room 412" (required) · "Recorded with your name."
- Confirm (bulk remove after go-live): "Remove 3 rooms from Kora Victoria Island? They stop counting as rooms you can sell, and the owner's daily report will show it." → "Remove 3 rooms"
- Permission denied: "Only a GM or the owner can set up rooms. Ask your GM."
- All hotels selected: "Rooms are set up per hotel. Pick a hotel."

## Out of scope
- Out of order and out of service with dates (brick 7; work orders in Stage 2), housekeeping status changes beyond the one-time **Mark N inspected**.
- Room type photos and descriptions for guests (Stage 4 booking engine), channel mapping and "Sold on" (Stage 4), base rate (brick 2).
- Copying room types between hotels, group-wide room types.
- A total guest cap lower than adults + children, extra beds and cots as stock.
- Room credits for housekeeping (Stage 2 settings), key-card encoder room mapping (after v1).
- Import from CSV/Excel (brick 17), floor plans and maps.

## Decisions
1. **Who sets up rooms (owner, 2026-11-26):** a new `rooms.setup` permission for owner, group admin and general manager.
2. **Max guests:** adults + children is enough for v1. The Okoro walk-in conflict is settled in brick 8 (walk-in), not here.
3. **Ground-floor numbering:** `G01` by default; any room number can be typed, so hotels that use `001` or `101` aren't blocked.
4. **Exception scope:** only room count and type changes after go-live reach the owner's report; features and connecting rooms don't.

Decisions 2–4 follow the recommendations above; the owner can change them before the build is merged.
