# The hotel switch scopes every page

- **Status:** approved (owner, 2026-11-26) for the agreed rule below. The open questions at the end go beyond that rule. Each has a default the build follows unless the owner says otherwise, and none blocks this brick.
- **Stage:** 1, brick 1b in [stage-1-plan.md](stage-1-plan.md), after Hotels and companies (0) and Room types and rooms (1), before Rate plans (2). It depends only on what Stage 0 and those two bricks built: the hotel switch with All hotels (`stage-0-role-homes.md`), the "ask before switching" guard and the Hotels and Companies pages (`stage-1-hotels-and-companies.md`), and the Rooms page with "Pick a hotel" (`stage-1-room-types-and-rooms.md`). It goes first in Stage 1's remaining bricks so that reservations, the tape chart, folios and reports are built to the rule from day one rather than fixed afterwards.
- **Module:** Platform (app shell and settings).
- **Walkthroughs:** `owner-morning.md` step 6 (the hotel switch now changes every page, not only Home), `going-live.md` "Later: opening Kora Lekki" (Members and Devices show Kora Lekki's people and devices). Changes listed under "Changes needed in other docs", to be made in the same commit as the build.
- **Screens:** Shell top bar (hotel switch), Group executive home (#1), Property GM home (#2), Members and roles (#25 `SetMembers`), Devices (#25 `SetDevices`), Permissions and limits (#26), Properties list and settings (#25), Companies (#25 `SetEntities`), Rooms (#33), Audit log viewer (#28, when built). No new screens.
- **Decisions:** none new. Builds on `0003-organization-property-entity.md` (a property is the boundary for operational data). The in-page "All properties" filter pills in the report and Employees designs (`DSGovernance`, `Employees`) are replaced by the top-bar switch, logged in `docs/design/CHANGES.md`.

## Problem
Mrs Okafor picks Kora Abuja in the top bar, opens Members and roles, and sees all eleven people in the group, nine of them at Kora Victoria Island. Devices lists Victoria Island's three tablets with no word about Abuja. Home and Rooms already change with the switch; the other pages ignore it. So she can't trust what a page is showing: is this the Abuja team or the whole group? As reservations, folios, cash and reports arrive, a page that silently shows another hotel's data is how a GM reads the wrong night's cash or a manager approves a refund at the wrong hotel. The switch has to mean the same thing on every page, now, before Stage 1 adds the pages that carry money.

## Persona and job
- **Owner, group admin, group finance** (Mrs Adaeze Okafor, Kunle Ade; laptop and phone; many times a day): look at one hotel at a time, or the whole group, and trust that every page shows exactly what the switch says.
- **GM or manager limited to some hotels** (Tunde Bello at Kora Victoria Island; a revenue manager covering two hotels): work in their hotel without seeing another's data, and switch between their hotels when they have more than one. No All hotels.
- **Staff on shared devices** (Chiamaka, Emeka): unchanged. A PIN session is fixed to the device's hotel and has no switch.
- **Every future module's builders:** one rule to follow, so new pages behave the same from their first commit.

## Success looks like
- Every page in the app either shows only the selected hotel, shows every hotel with the hotel named on each row (All hotels), says it is group-wide, or asks to pick a hotel. None ignores the switch. A browser test walks every built page in both modes and checks it.
- Switching hotels is 1 choice in the top bar and never shows another hotel's rows under the new hotel's name, not even for a moment.
- Home's per-hotel people and device counts equal the totals on Members and Devices for that hotel (server test for every seeded hotel).
- A request for a hotel outside the member's access returns "not found", whatever the web app sends (server tests on every list that takes a hotel).
- Every page's heading area and tab title name the hotel, "All hotels" or "Whole group".

## The rule
1. **One hotel selected:** every page shows that hotel only.
   - Team: the people who work there, including people with whole-group access (owner, group admin, group finance), marked **Whole group**.
   - Devices: that hotel's devices. Companies: the company that owns it. Finance, reports and operations (from their bricks): that hotel.
2. **All hotels selected** (only for members who see the whole group, in a group with more than one hotel):
   - **Group pages** show everything, with the hotel named on each row or in a column: Home, Hotels, Companies, Members, Devices, the audit log, reports, consolidated finance, reservations search and corporate accounts (from their bricks).
   - **Hotel pages** only make sense for one hotel and ask to pick one, like Rooms does today ("Rooms are set up per hotel. Pick a hotel."). Later: tape chart, front desk lists, cashier shifts, night audit, room board, restaurant floor and POS.
   - **Group-wide pages** are the same whatever is selected and say so: Permissions and limits.
3. **Every page names its scope:** an eyebrow line above the page title ("Kora Abuja", "All hotels" or "Whole group"), and the tab title ("Members and roles · Kora Abuja · Vento Hotels").
4. **The switch only narrows.** It never widens what a member may see. The server's property scoping is unchanged and decides; every list that takes a hotel checks it. People limited to one hotel have no switch; people limited to several have no All hotels (existing rule in `property-context.tsx`).
5. **Same everywhere.** A new page declares which kind it is (hotel, group or group-wide) and uses the shared pieces below. Nothing else.

## User flow
**A. The owner looks at Kora Abuja's team** (Mrs Okafor, laptop, Thu 26 Nov 2026; All hotels selected; demo seed with the additions under "Demo seed").
1. **Settings › Members and roles**. The eyebrow says "All hotels". People **11**, with a **Can see** column ("Whole group", "Kora Victoria Island", "Kora Victoria Island, Kora Ikeja GRA"). Invited **1**: ngozi@kora.example · General manager · Kora Abuja.
2. She chooses **Kora Abuja** in the top-bar switch (1 choice). The page stays on Members. The rows fade to a skeleton (never Victoria Island's rows under Abuja's name), then:
   - Eyebrow "Kora Abuja". Description: "People who work at Kora Abuja, including 2 with access to the whole group."
   - People **2**: Adaeze Okafor (you) and Kunle Ade, each marked **Whole group**.
   - Invited **1**: Ngozi.
   - A note: "Nobody works only at Kora Abuja yet. Invite its managers and staff." → **Invite people**.
3. **Invite people** (click 2). The invite opens with Hotels already set to **Kora Abuja**. She types two emails and clicks **Send 2 invites** (click 3). They appear under Invited.
4. **Devices** in the sidebar (click 4). Eyebrow "Kora Abuja". "No shared devices at Kora Abuja yet. Open Vento on the front desk PC, restaurant tablet or housekeeping phone there, sign in, and register it here."
5. **Permissions and limits** (click 5). Eyebrow "Whole group". Note: "Permissions are set per role and apply at every hotel. Which hotels each person sees is set in Members and roles."
6. She chooses **All hotels** again. Devices shows Victoria Island's 3 devices and Ikeja GRA's 1, each row naming its hotel. **Rooms** shows "Rooms are set up per hotel. Pick a hotel."

**B. A link that names a hotel** (Mrs Okafor, All hotels, Home).
1. Needs attention says "No shared devices at Kora Abuja" → **Register** (click 1).
2. Devices opens with **Kora Abuja** selected in the top bar and its empty state, because the link carried `?hotel=<Kora Abuja's id>`. The address bar is tidied back to `/settings/devices`.

**C. A manager on two hotels** (Sade Bakare, revenue manager, Kora Victoria Island and Kora Ikeja GRA).
1. The switch lists her two hotels and no All hotels. Every page she can open shows the hotel she chose. Another hotel's id in a link is ignored with "That link is for a hotel you can't open. Showing Kora Victoria Island."

**D. Unsaved work when the hotel changes** (Mrs Okafor, Kora Victoria Island's settings with the check-out time changed but not saved).
1. She chooses Kora Abuja in the switch. The page asks "Discard changes to Kora Victoria Island?" (existing guard) → **Discard changes** switches; **Keep editing** stays on Victoria Island with her change.

## Acceptance criteria

### Main path: the shared behaviour (every page)
- **Kinds.** Each page in the app shell is one of:
  - **hotel page** (one hotel only; with All hotels it shows "Pick a hotel"),
  - **group page** (one hotel or every hotel), or
  - **group-wide page** (the same whatever is selected).

  The table below lists every built page.
- **Scope eyebrow.** Above every page's `h1`, `PageHeader` shows the scope: a building icon and the hotel's name, a layers icon and "All hotels", or "Whole group" on group-wide pages. It is shown even to members with one hotel (no switch), so nobody wonders which hotel a page is about. Long names truncate with a tooltip.
- **Tab title:** `{Page} · {Hotel name | All hotels | group name} · Vento Hotels`, through one helper (`useScopedTitle`), e.g. "Members and roles · Kora Abuja · Vento Hotels", "Permissions and limits · Kora Hotels Group · Vento Hotels". Home keeps "Home · Kora Abuja".
- **When the hotel changes on a page:**
  - The route stays.
  - The page number goes back to 1, and any open record sheet (`?sheet=`, `?id=`) closes, since it belonged to the old hotel.
  - Search text and filters stay.
  - Focus moves to the `h1`, and a polite live region says "Showing Kora Abuja" (as Home does today).
- **Never the wrong hotel's rows.** Data for one hotel is cached under that hotel's key. On a switch, the page shows that hotel's cached data or a skeleton, never the previous hotel's rows (no `keepPreviousData` across a hotel change; it stays allowed for paging within one hotel).
- **Unsaved changes.** A page, sheet or dialog with unsaved input registers the existing leave guard (`useLeaveGuard`). Choosing another hotel asks first, in the page's own words ("Discard changes to Kora Victoria Island?", "Discard this invite?"). A sheet or dialog with nothing typed just closes, and the hotel changes.
- **A save in flight** when the hotel changes finishes against the hotel it was made for, because every write carries its own `propertyId`. Its toast names that hotel ("FD-ABJ-01 registered at Kora Abuja").
- **Hotel pages with All hotels** use one shared `PickHotel` panel (moved from `components/rooms/` to `components/shell/`) with a page-specific first line: "Rooms are set up per hotel. Pick a hotel." Picking a hotel selects it in the top bar.

### Main path: page by page
| Page | Kind | One hotel | All hotels | This brick |
|---|---|---|---|---|
| Home | group | that hotel's Home | group Home | already follows; invite count per hotel (below) |
| Settings › Hotels | group | that hotel's settings | list of hotels | already follows; title format only |
| Settings › Companies | group | the owning company | every company | already follows for group-wide members; small change for others (below) |
| Settings › Members and roles | group | people who work there + whole-group people; invites for it | everyone, Can see column | **new** |
| Settings › Devices | group | that hotel's devices | every device, hotel on each row | **new** |
| Settings › Permissions and limits | group-wide | same, "Whole group" | same | **new** (eyebrow and note) |
| Rates & channels › Rooms | hotel | that hotel's rooms | Pick a hotel | already follows; eyebrow and title only |
| Audit log viewer (#28) | group | events at that hotel | every event, hotel column, group events marked "Group" | rule only; built in its own brick |

**Members and roles**
- **One hotel selected:**
  - People lists everyone who **works at** the hotel: members given that hotel, plus members with whole-group access (owners, group admins, and anyone given "Whole group"). Whole-group people show a **Whole group** badge in the Can see column (on phones, under the name).
  - Sorted as today: you first, then by name.
  - The People count equals Home's people figure for that hotel.
  - Description: "People who work at Kora Abuja, including 2 with access to the whole group."
- **All hotels:** unchanged. Everyone in the group, with Can see ("Whole group", "Kora Victoria Island", "Kora Victoria Island, Kora Ikeja GRA +1"). People whose only hotel was archived show "No hotels yet" and appear only here.
- **Filters and search** (Owners and admins, Managers, Staff; name or email) combine with the hotel. "No one matches these filters." → **Clear filters** clears the filters, not the hotel.
- **Invited** (whole-group managers only, as today), one hotel selected: invites that include the hotel, plus whole-group invites. Ngozi's invite shows under Kora Abuja, not under Kora Victoria Island. Hidden when there are none, as today.
- **Invite people:**
  - One hotel selected: Hotels starts as that hotel only, whoever is inviting.
  - All hotels: starts as today (whole group for whole-group managers).
  - Choosing Owner or Group admin still forces whole group. `?invite=<id>` (a new hotel's "Invite the team") still wins.
- **Nobody works only here.** When everyone at the hotel has whole-group access, a card says "Nobody works only at Kora Abuja yet. Invite its managers and staff." → **Invite people**. It replaces "It's just you so far" in the one-hotel view; that line stays for All hotels.
- **Edit someone** from a one-hotel view so they no longer work there: the toast says "Chidi Eze removed from Kora Victoria Island", and the row leaves the list. Their account and other hotels are untouched.

**Devices**
- **One hotel selected:**
  - That hotel's devices only, live first, then revoked (muted, as today), then by name.
  - The hotel name is left off each row, since the eyebrow says it.
  - The count matches Home's "Shared devices" for that hotel.
- **All hotels:** every device at an active hotel, each row naming its hotel ("Front desk PC · Kora Victoria Island"), sorted live first, then by hotel, then by name. Revoked devices of archived hotels aren't listed; their history stays in the audit log.
- **Register this device:**
  - One hotel selected: Hotel defaults to it.
  - All hotels: Hotel starts empty and is required ("Choose the hotel this device is at"), so a tablet in Abuja is never bound to the last hotel picked by accident.
  - `?register=<id>` still wins.
  - If the chosen hotel differs from the one selected, the top bar switches to the device's hotel on success: this browser now is that hotel's device.
- **"Lock this device"** shows whenever this browser is a registered, live device, whichever hotel is selected. The page reads that from `devices.lockScreen`, not from the hotel's list. When the device belongs to another hotel, the hint says "Registered at Kora Ikeja GRA".

**Companies (verified against the hotels-and-companies build)**
- Built and correct for whole-group members: one hotel shows only the owning company with "Kora Victoria Island is owned by Kora Hospitality Ltd. Choose All hotels in the top bar to see every company."
- Change: today the narrowing applies only when the member can choose All hotels, so a manager limited to some hotels sees every company whatever is selected. From this brick, one hotel selected always shows only the owning company. The second sentence ("Choose All hotels…") shows only to people who have All hotels.
- Title becomes "Companies · Kora Victoria Island" / "Companies · All hotels".

**Hotels (verified)**
- Built and correct: All hotels shows the list, one hotel shows its settings, and `?hotel=` selects a hotel.
- Change: the `?hotel=` handling moves from the Hotels page into the shell (Deep links below). Title becomes "Hotel settings · Kora Victoria Island" / "Hotels · All hotels".

**Permissions and limits**
- Group-wide: permissions are per role, not per hotel, so the page is the same with any selection.
- Eyebrow "Whole group" and, under the description, "Permissions are set per role and apply at every hotel. Which hotels each person sees is set in Members and roles." (link).
- Title "Permissions and limits · Kora Hotels Group".

**Home and Rooms (verified)**
- **Home** already follows the rule. Two fixes:
  - With one hotel selected, "invites not accepted yet" counts that hotel's invites, not the group's (from `byHotel`).
  - Home's per-hotel links (People, Shared devices, "No shared devices at Kora Abuja · Register") carry `?hotel=`, so they land on that hotel.
- **Rooms** already follows the rule. It gains the eyebrow and the title "Rooms · Kora Victoria Island".

**Audit log viewer (rule for its brick)**
- One hotel: events whose hotel is that hotel.
- All hotels: every event the member may see, with a Hotel column. Events with no hotel (company changed, permission changed, whole-group member changed) show "Group".
- `audit.list` gains `propertyId` in that brick, with the same checks as below.

### Deep links and the URL
- **The selected hotel isn't part of every URL.** It stays in the switch, remembered per browser (`vento.propertyId`, `vento.lastPropertyId`). A URL copied from the address bar opens in the reader's own selection.
- **Any page accepts `?hotel=<id>`, or `?hotel=all`,** handled once in the app shell before the page's first data request:
  - It selects the hotel, saves it as the person's choice (not during a role preview), and removes the parameter from the address bar (replace, not a new history entry).
  - `all` works only for people who have All hotels.
- **Every link Vento makes to one hotel's data carries `?hotel=`:** Home's per-hotel links, Next steps, emails, and later the owner's daily report and notifications.
- **A link for a hotel the person can't open** is ignored, whether the hotel is unknown, outside their access or archived, and whether they're on a shared device fixed to another hotel. The parameter is removed, and a toast says "That link is for a hotel you can't open. Showing Kora Victoria Island." The same message covers all of these, so it never reveals whether the hotel exists.
- **Tabs:** each tab keeps its own selection once open. A new tab opens on the last hotel chosen anywhere on this browser.

### Organization isolation
- Every list that takes a `propertyId` checks it against the session's organization first. Another group's hotel id answers "We couldn't find that hotel", the same as an unknown id.
- Nothing about the selection is stored on the server or in the session. Every request names its hotel explicitly.

### Property scoping
- **The server is unchanged and authoritative:** `propertyScope` / `scopeToProperties` decide what a member may see. With no `propertyId`, a list returns everything within the member's access, as today.
- **With a `propertyId`**, a list returns only that hotel's rows, after checking the hotel is:
  1. in the member's access, else NOT_FOUND "We couldn't find that hotel";
  2. not archived, else NOT_FOUND "This hotel was archived." (the hotels spec's wording; given only to people who could see the hotel).
- **Members.** The hotel filter narrows within the existing `visibleMembers` rule; it never shows someone the caller couldn't already see.
  - A manager limited to some hotels (only possible through a permission override, since group admins always have the whole group) keeps seeing only the people they manage.
  - For them, the People count can be lower than Home's people figure. See Open question 3.
- **Shared devices:** a PIN session's requests are already limited to the device's hotel. A `propertyId` for another hotel answers NOT_FOUND.
- **Member with 2 of 4 hotels:** sees only those two in the switch, no All hotels, and each page shows the chosen one. A `propertyId` for either other hotel answers NOT_FOUND.
- **Access removed while working:** the owner removes Kora Abuja from Sade's access while she has it selected. Her next request answers NOT_FOUND. The shell then reloads her hotel list, falls back to her first hotel, and says "You no longer have access to Kora Abuja. Showing Kora Victoria Island."
- **Archived hotel:** it leaves the switch (already built). A browser that had it selected falls back as above. Its people and devices are no longer listed under any hotel.

### Permissions, limits and approvals
- No new permission and no limits. Choosing a hotel is a view choice, not an action.
- Each page keeps its own permission: Members, Devices, Companies need `setup.manage`; Permissions needs `setup.manage` or `permissions.manage`; Rooms needs `rooms.setup`; Hotels needs `setup.manage` or `property.operating_times`.
- Who gets All hotels is unchanged: members who see the whole group (owner, group admin, and roles given "Whole group" such as finance or viewer), in a group with more than one hotel, signed in with a password.

### Audit events
- None new. Choosing a hotel isn't audited: it changes nothing, and sign-ins are already audited.
- Writes made from a one-hotel view record that hotel's `propertyId` and business date, as they do today, because the write carries it.

### Leakage exceptions
- Not relevant: nothing here moves money or room nights.
- The rule matters for the owner's daily report (brick 16): one hotel's report and its link (`?hotel=`) open that hotel, and "All hotels" consolidates.

### Offline behaviour
- The switch works offline over the cached hotel list.
- Pages show what's cached for the chosen hotel, with "Last updated 14:32". A hotel never opened on this device shows the page's offline state ("Not saved on this device yet. Connect to see Kora Abuja."), never another hotel's data.
- Settings stay read-only offline (existing rule).
- Offline commands (from the first outbox brick) carry their own `propertyId` and business date, taken when the action happened. Changing the switch never changes a queued command's hotel.

### Business date
- With one hotel selected, the top bar shows that hotel's business date; with All hotels, none (built).
- Pages that show dates use the selected hotel's business date. Group pages with All hotels show each row's own hotel date.
- Nothing here changes a business date.

### Tax lines
Not relevant.

### Foreign currency
Not relevant. (From Stage 5, consolidated money with All hotels is shown in NGN, each hotel's entries converted at their own stored rates. That's the consolidation brick's rule, noted here so it isn't forgotten.)

### Availability locking
Not relevant. Reservations (brick 4) take their hotel from the request, never from the switch.

### Empty, error and edge cases
- **Empty, one hotel:**
  - Devices: "No shared devices at Kora Abuja yet." with the registration help and **Register this device**.
  - Members: never empty, since group-wide people are always listed. "Nobody works only at Kora Abuja yet." as above.
  - Invited: hidden when empty.
- **Empty, All hotels:** the existing empty states.
- **Filtered empty:** "No one matches these filters at Kora Abuja." → **Clear filters**.
- **Load error:** the existing per-page error, naming the hotel where there is one: "We couldn't load the people at Kora Abuja." → **Try again**.
- **Group with one hotel:** no switch and no All hotels (built). Eyebrows still name the hotel.
- **Group-wide people shown at every hotel:** yes, with the Whole group badge. Removing one of them from a single hotel isn't possible from that hotel's view. **Edit** shows their access as Whole group, and changing it is the normal edit.
- **A member with no hotel left** (their only hotel archived): listed only under All hotels, with "No hotels yet".
- **Role preview** (owner previewing "Front desk"): the preview shows one hotel, as built. A `?hotel=` link during a preview selects for the preview only and isn't saved.
- **A new hotel added by another owner:** appears in the switch on the next page load (built). A link to it before then reloads the hotel list once before saying it can't be opened.
- **Long hotel names** ("Kora Victoria Island Serviced Apartments and Conference Centre") truncate in the eyebrow and switch with a tooltip, and wrap in descriptions.
- **Phones (375px):** the eyebrow sits on its own line above the title. The Whole group badge sits under the person's name.

## Behind the scenes
- **Folio postings, night audit, ledger:** none. Each of those bricks takes its hotel from the request.
- **Jobs and notifications:** none. Links in messages carry `?hotel=` from now on.
- **Web (for the architect):**
  - One hook returns the page's scope: `{ kind: 'hotel', hotel }` or `{ kind: 'all' }`. With All hotels, pages never read `current` (the last hotel picked) to scope data; it remains only the default for hotel pages and forms.
  - `PageHeader` takes the eyebrow from it, and `useScopedTitle(page)` sets the tab title.
  - The shell handles `?hotel=` and the hotel-change reset (page, sheets, focus, announcement).
  - `PickHotel` moves to `components/shell/`.
  - Query keys include the `propertyId`.
- **API (contract changes):**
  - `members.list`: new optional `propertyId`. Returns members who work at the hotel: a `member_properties` row for it, or whole-group access (`allProperties`, or role `owner` / `group_admin`), within `visibleMembers`. Checked as under Property scoping.
  - `invitations.list`: new optional `propertyId`. Returns invitations with an `invitation_properties` row for it, or whole-group invitations. Same checks.
  - `devices.list`: new optional `propertyId`. Returns devices bound to it. Without it, only devices at active hotels. Same checks.
  - `organization.home`: `byHotel[]` gains `invites` (pending, unexpired invitations for that hotel, including whole-group ones; `null` for people who don't manage the team). Its `people` count and `members.list({ propertyId })` use one shared server predicate ("works at"), so they can't drift. Today they are computed separately, and an owner or group admin row without `allProperties` set would be counted differently.
  - `entities.list`: no change (already has `propertyId` with these checks; it is the model).
  - `audit.list`: `propertyId` added in the audit log viewer's brick.
  - One shared server check, `requireListableHotel(db, access, propertyId)`, does both checks for every list. `entities.list` moves onto it.
- **Data import at go-live:** none. Nothing here holds master data or balances.

### Demo seed
To make the rule visible in review:
- Add **Sade Bakare** (revenue manager, `sade@kora.example`) with access to Kora Victoria Island and Kora Ikeja GRA: the member with 2 of 4 hotels.
- Add device **FD-IKJ-01** (front desk) at Kora Ikeja GRA, so All hotels shows devices at two hotels. Kora Abuja and Kora Port Harcourt keep none, for the empty state.
- Resulting counts:

  | Hotel | People | Devices | Invites |
  |---|---|---|---|
  | All hotels | 11 | 4 | 1 |
  | Kora Victoria Island | 11 (2 whole group, 9 assigned) | 3 | 0 |
  | Kora Ikeja GRA | 3 (2 whole group, Sade) | 1 | 0 |
  | Kora Abuja | 2 (whole group only) | 0 | 1 (Ngozi) |

### Owner's review (what to try)
- **As `adaeze@kora.example`:**
  1. Members and Devices with All hotels, then with Kora Abuja, Kora Ikeja GRA and Kora Victoria Island.
  2. Invite someone with Kora Abuja selected.
  3. Permissions with any hotel.
  4. Rooms with All hotels.
  5. Home → "No shared devices at Kora Abuja" → Register.
  6. Change a hotel's check-out time, don't save, and switch hotels.
- **As `sade@kora.example`:** the switch shows two hotels and no All hotels.
- **As `tunde@kora.example`:** no switch; every page says Kora Victoria Island.

### Changes needed in `docs/DOMAIN.md`
1. **Tenancy table, new row "Hotel switch":** "The top-bar choice of the hotel a member is working in, or **All hotels**. Every page shows the selected hotel only. With All hotels, group pages show every hotel with its name, hotel pages ask to pick one, and group-wide pages (Permissions and limits) are the same either way. It narrows what the member may already see; the server's property scoping decides. Remembered per browser, never audited. Links to one hotel's data carry it as `?hotel=`."
2. **Tenancy table, new row "Whole-group access":** "A member who sees every hotel: owners and group admins always, other roles when given 'Whole group'. Counted and listed among the people of every hotel, marked 'Whole group'. Only they get **All hotels**, and only in a group with more than one hotel."
3. **Member row:** after "optionally limited to properties or entities", add "(a member **works at** a property when they're given it or have whole-group access)".
4. No permission rows, exceptions or reports change.

### Changes needed in other docs (same commit as the build)
- `docs/journeys/owner-morning.md` step 6: after tapping the Kora Abuja row, "every page now shows Kora Abuja until she chooses All hotels: Members lists its people with her and Kunle marked Whole group, and Devices says it has none yet."
- `docs/journeys/going-live.md` "Later: opening Kora Lekki": with Kora Lekki selected, Members shows only Adaeze and Kunle (Whole group) until its GM joins, and Devices says "No shared devices at Kora Lekki yet". Add to "Becomes tests": Members and Devices follow the switch; Home's counts match them.
- `docs/journeys/README.md` demo world: add Sade Bakare (revenue manager, Kora Victoria Island and Kora Ikeja GRA) and device FD-IKJ-01 at Kora Ikeja GRA.
- `docs/design/CHANGES.md`:
  - the scope eyebrow on every page header;
  - in-page "All properties" pills (`DSGovernance`, `Employees`) replaced by the top-bar switch;
  - Devices with one hotel drops the hotel name from rows.
- `docs/design/screen-inventory.md`: note "follows the hotel switch" on Members and roles, Devices and Permissions when built.
- `apps/web/e2e/accessibility.spec.ts`: no new pages; scan Members and Devices in both scopes.

## UI copy
- **Eyebrows:** "Kora Abuja" · "All hotels" · "Whole group"
- **Tab titles:** "Members and roles · Kora Abuja · Vento Hotels" · "Devices · All hotels · Vento Hotels" · "Permissions and limits · Kora Hotels Group · Vento Hotels" · "Rooms · Kora Victoria Island · Vento Hotels"
- **Live region:** "Showing Kora Abuja" · "Showing all hotels"
- **Members:**
  - Description, one hotel: "People who work at Kora Abuja, including 2 with access to the whole group."
  - Description, All hotels: "Who can sign in to Kora Hotels Group, their role, and which hotels they see." (as today)
  - Badge: "Whole group"
  - Note: "Nobody works only at Kora Abuja yet. Invite its managers and staff." → "Invite people"
  - Filtered empty: "No one matches these filters at Kora Abuja." → "Clear filters"
  - Error: "We couldn't load the people at Kora Abuja." → "Try again"
  - Toast: "Chidi Eze removed from Kora Victoria Island"
- **Devices:**
  - Empty, one hotel: "No shared devices at Kora Abuja yet. Open Vento on the front desk PC, restaurant tablet or housekeeping phone there, sign in, and register it here." → "Register this device"
  - Hotel field, All hotels: "Hotel" (required) · error "Choose the hotel this device is at"
  - Hint by Lock this device: "Registered at Kora Ikeja GRA"
  - Toast after registering at another hotel: "FD-ABJ-01 registered at Kora Abuja"
- **Permissions:** "Permissions are set per role and apply at every hotel. Which hotels each person sees is set in Members and roles."
- **Companies, one hotel, no All hotels:** "Kora Victoria Island is owned by Kora Hospitality Ltd."
- **Pick a hotel (hotel pages with All hotels):** "Rooms are set up per hotel. Pick a hotel." · "You can switch hotels any time from the top bar." Later bricks: "The tape chart shows one hotel at a time. Pick a hotel." / "Cashier shifts are per hotel. Pick a hotel."
- **Links and access:**
  - "That link is for a hotel you can't open. Showing Kora Victoria Island."
  - "You no longer have access to Kora Abuja. Showing Kora Victoria Island."
- **Leave guard:** "Discard changes to Kora Victoria Island?" (built) · "Discard this invite?" → "Discard invite" / "Keep editing"
- **Offline, uncached hotel:** "Not saved on this device yet. Connect to see Kora Abuja."
- **API errors:** "We couldn't find that hotel" · "This hotel was archived."

## Out of scope
- **No in-page hotel filters.** The top-bar switch is the only hotel filter, so pages never disagree with it.
- **No multi-select of hotels** (e.g. "Lagos hotels"), and no "All my hotels" for members limited to several hotels (Open question 2).
- **The selected hotel in every URL** (Open question 1).
- **Making Home's setup checklist per hotel.** It stays the group's onboarding checklist. Each new hotel's own steps are its Next steps card in Hotel settings (built).
- **Changing who may see whom on Members** for hotel-limited managers (Open question 3).
- **Consolidation rules for money** (currency, inter-company), which belong to Stage 5.
- **Groups with more than 100 hotels in the switch.**

## Open questions
These go beyond the agreed rule. The build follows the default unless the owner decides otherwise.
1. **Hotel in the URL (owner):** should every URL carry the selected hotel, so a copied address bar always opens the same hotel? Default: no. The switch is remembered per browser, and only links Vento makes carry `?hotel=`. This keeps URLs short and avoids a second source of truth that could disagree with the switch.
2. **Members limited to several hotels (owner):** should someone with 2 of 4 hotels get an "All my hotels" view? Default: no. All hotels stays for whole-group members (existing rule). Revisit with Stage 6 group dashboards, if area managers need it.
3. **Hotel-limited managers on Members (owner):** a manager given `setup.manage` by override but limited to some hotels sees only the people they manage. Should they also see the hotel's whole-group people and colleagues who span other hotels, read-only, so their count matches Home? Default: no change. Server visibility stays exactly as built (the agreed rule says server scoping is unchanged). For them the page says "People you manage at Kora Victoria Island".
4. **Companies for people without All hotels (owner):** default: one hotel selected always shows only its owning company, for everyone, as the rule says. The alternative keeps the current build, where hotel-limited managers see every company.
5. **Tab title order (owner):** default `{Page} · {Hotel}` (easier to tell tabs apart), which changes the built Companies and Hotel settings titles. Home keeps "Home · {Hotel}".
6. **Registering a device for another hotel (owner):** default: the top bar switches to the device's hotel on success, since this browser now belongs there.
7. **Revoked devices of archived hotels (owner):** default: not listed under All hotels, with their history kept in the audit log.
8. **Demo seed additions (owner):** default: add Sade Bakare and FD-IKJ-01 as above.
