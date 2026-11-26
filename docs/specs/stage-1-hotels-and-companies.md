# Hotels and companies

- **Status:** approved (owner, 2026-11-26) for the scope below. The open questions at the end go beyond that scope. Each has a default the build follows unless the owner says otherwise, and none blocks this brick.
- **Stage:** 1, built before the rest of the plan in [stage-1-plan.md](stage-1-plan.md). It finishes Stage 0's "set up a group and its hotels": the API (`properties.list/get/create`, `entities.list/create`) shipped in Stage 0, but no screen lets anyone add a second hotel, fix a hotel's details, close one, or manage companies. Depends on nothing beyond Stage 0. Fits the hotel-switch brick that follows it (every page scoped by the top-bar hotel switch).
- **Module:** Platform (tenancy and settings).
- **Walkthroughs:** `going-live.md` step 1 (changed: onboarding only asks for names, so the company's RC number, TIN and VAT registration and the hotel's address are completed here) and a new step 1b, plus a new closing section "Later: opening Kora Lekki" (user flow B below). The changes are listed at the end, for the product-manager to make in the same change as the build.
- **Screens:** Properties list and property settings (#25: `Settings.dc.html` section `property`, `SetProperty.dc.html`, `SetPropertyM.dc.html`, with the loading, error and offline states in `SetLoading*`, `SetError*`, `SetOffline*`). Entities and departments (#25: `Settings.dc.html` section `entities`, `SetEntities.dc.html`; departments are not built). The hotels list and the archive dialog have no board of their own and follow the design system (`pattern`), using the devices table and the revoke dialog (`SetRevoke.dc.html`) as the model.
- **Decisions:** `0003-organization-property-entity.md`, `0006-business-date-and-night-audit.md`, `0016-local-object-storage.md` (first upload in the product), `0022-shared-devices-and-pin.md` (what revoking a device does). No new decision record needed.

## Problem
Kora Hotels Group signed up with one company name and one hotel name. Now Mrs Okafor needs to add the RC number, TIN and VAT registration that every invoice and tax report will carry, and the street address the registration card and guest messages need. She also needs to add the three other hotels and the companies that own them, and later open Kora Lekki or close a hotel whose lease has ended. Today she can do none of this without asking Vento's team to run a script. A wrong owning company, or a closed hotel that still has devices signed in, is exactly where money and room nights slip out of sight.

## Persona and job
- **Owner or group admin** (Mrs Adaeze Okafor, laptop, a few times a year): add a hotel or company, complete their details, change which company owns a hotel, close a hotel and keep its history.
- **GM** (Tunde Bello, laptop, rarely): change Kora Victoria Island's check-in and check-out times, and see its details and business date. Nothing else here (proposed permission below).
- **Everyone else** never opens these pages. They see the results: the hotel switch, the address on registration cards and invoices, the company on invoices and in finance.

## Success looks like
- A new hotel added with its address, company and times in under 2 minutes, with 3 clicks plus typing. It appears in the owner's hotel switch at once, and the GM can be invited to it from the same screen.
- Onboarding's bare company completed with RC number, TIN and VAT registration in under 1 minute.
- No hotel without a valid owning company, no company archived while it owns an active hotel, and no hotel or company name used twice in a group (database constraints, proved by tests).
- Closing a hotel leaves no device signed in to it, nobody working there by accident, and nothing deleted: its rooms, audit trail and (later) folios and reports stay readable.
- After go-live, closing a hotel, moving it to another company, or changing a company's TIN or VAT registration shows in the next owner's daily report with the name and reason.

## User flow

**A. Complete what onboarding left out** (Mrs Okafor, Thu 12 Nov 2026, straight after onboarding; business date 12 Nov at Kora Victoria Island).
1. Home's setup checklist shows **Complete hotel and company details** ("Address, RC number, TIN and VAT, for invoices and the guest register"). She clicks it. Kora Victoria Island is her only hotel, so **Settings › Hotels** opens that hotel's settings directly.
2. A banner says "Add Kora Victoria Island's address. Registration cards, invoices and guest messages use it." She types the street (Plot 1412 Ahmadu Bello Way) and the area (Victoria Island), picks Lagos then Eti-Osa, and clicks **Save changes**. Toast "Kora Victoria Island saved" (1 click after typing).
3. She clicks **Upload** under the logo, picks `kora-logo.png`, and the preview appears. Toast "Logo saved" (2 clicks).
4. Under Owning company, the company shows "Kora Hospitality Ltd · RC number and TIN missing" with **Edit company**. A side sheet opens: RC number `RC 1184402`, TIN `21847390-0001`, VAT registered: Yes, then **Save company**. Toast "Kora Hospitality Ltd saved" (2 clicks after typing). The checklist step is done.

**B. Add a hotel** (Mrs Okafor, later; the group has 4 hotels and "All hotels" is selected in the top bar).
1. **Settings › Hotels** lists the 4 hotels. She clicks **Add a hotel** (click 1).
2. A side sheet opens: Name `Kora Lekki`; Owning company (Kora Hospitality Ltd already chosen, as the company that owns the most hotels); Street `Plot 7 Admiralty Way`; Area `Lekki Phase 1`; State `Lagos`; LGA `Eti-Osa`; Check-in from `14:00` and Check-out by `12:00` pre-filled; time zone `Africa/Lagos` under **More options**.
3. She clicks **Add hotel** (click 2). The sheet closes, the top bar switches to Kora Lekki, and its settings page opens with the toast "Kora Lekki added" and a **Next steps** card: **Set up rooms**, **Invite the team**, **Register devices** (click 3: any one of them).
4. **Invite the team** opens Members with the invite sheet already limited to Kora Lekki.

**C. Close a hotel** (Mrs Okafor; Kora Port Harcourt's lease has ended and nothing is open there).
1. In Kora Port Harcourt's settings she clicks **Archive hotel** at the foot of the page (click 1).
2. The dialog says: "Archive Kora Port Harcourt? It leaves the hotel switch and every list. Its 72 rooms, history and reports are kept. 3 devices are signed out and revoked. 4 people work only here and will have no hotel until you give them another." Reason (required): "Lease ended 30 Nov 2026".
3. She clicks **Archive Kora Port Harcourt** (click 2). Toast "Kora Port Harcourt archived". The hotel shows under the **Archived** filter with **Restore**.

**D. GM changes times** (Tunde, limited to Kora Victoria Island). Settings › Hotels opens Kora Victoria Island. Every field is read-only except Check-in from and Check-out by. He sets check-out to 12:00 and clicks **Save changes** (1 click after typing).

## Acceptance criteria

### Main path
**Settings › Hotels: the list** (shown when "All hotels" is selected in the top bar)
- Header: "Hotels" · "Kora Hotels Group · 4 hotels", with the primary action **Add a hotel**.
- One row per active hotel: logo (or initials), name, area · state, owning company, rooms (active room count once rooms exist, from brick 1), business date, and status: **Setting up** (slate, no night audit yet) or **Live** (emerald, at least one night audit completed). Clicking a row opens that hotel's settings and selects it in the top bar.
- Server-paginated (25 per page), sorted by name. Filter chips **Active** (default) and **Archived**. A name search appears once the group has more than 10 hotels.

**Hotel settings** (shown when one hotel is selected, or opened from a row; the title is the hotel's name)
- Follows `SetProperty`, with these cards:
  - **Identity:** logo, name, and owning company with the hint "Invoices, VAT and the ledger use this company".
  - **Address:** street, area, LGA, state.
  - **Time and business date:** time zone, check-in from, check-out by, and the read-only business date panel.
- One **Save changes** for the page, disabled until something changes. Leaving with unsaved changes asks "Discard changes to Kora Victoria Island?" → **Discard changes**.
- The design's **Night audit at** field isn't shown until brick 13 builds the night audit (logged in `docs/design/CHANGES.md`).
- The design's subtitle "changes apply from the next business date unless noted" is replaced by the rule per field below (logged in `CHANGES.md`). Everything applies at once, except a change of owning company after go-live.
- Business date panel, never editable:
  - Before go-live: "Business date 12 Nov 2026 · No night audit yet. The first one makes this hotel live."
  - After go-live (from brick 13): "Current business date: Wed 25 Nov 2026 · Rolled by night audit at 00:47 · Bola Ojo" and "Only night audit moves this date".
- **Archive hotel** sits in a separate section at the foot of the page, for people with `setup.manage` only.

**Fields** (same rules in Add a hotel and Hotel settings)
- **Name:** required, 2–120 characters, unique in the group including archived hotels.
- **Owning company:** required, one of the group's active companies. If the group has one company it's preselected; otherwise the company that owns the most hotels is. The picker ends with **Add a company**, which opens the company sheet and comes back with the new company chosen.
- **Address:**
  - **Street:** required, up to 200 characters.
  - **Area:** required, up to 120 characters (e.g. "Victoria Island", "GRA Phase 2").
  - **State:** required, from the 36 states and FCT (`NIGERIAN_STATES`).
  - **LGA:** required, picked from the LGAs of the chosen state (a fixed list, as DOMAIN's locale defaults require). Changing the state clears the LGA.
  - **Country:** Nigeria, not shown (hotels outside Nigeria are out of scope).
- **Time zone:** under **More options**, default `Africa/Lagos`, shown as "Africa/Lagos · WAT". Any IANA zone, validated by the server. Editable until the hotel goes live; after that it's read-only with "The time zone is fixed once a hotel is live." (see Open questions).
- **Check-in from / Check-out by:** 24-hour times in 5-minute steps, defaults 14:00 and 12:00. A change applies at once to everything shown or calculated afterwards (arrival lists, late check-out, guest messages). Messages already sent don't change.
- **Hotels created in onboarding** have no street, area or LGA:
  - Their settings page shows the address banner from flow A until all three are filled.
  - Home's checklist keeps **Complete hotel and company details** open.
  - Saving the page with the address still empty is allowed, so other fields can be fixed first. The banner stays.

**Logo**
- PNG or JPEG, up to 2 MB, at least 200 px on the shorter side. The design's SVG isn't accepted: PDFs (`@react-pdf/renderer`) can't embed it, and SVG files can carry scripts (logged in `CHANGES.md`).
- The upload goes straight to object storage through a short-lived signed URL (5 minutes), limited to that size and type. The API then checks the stored file's real type from its first bytes, and its size and dimensions, before saving it on the hotel. A file that fails is deleted and the hotel keeps its old logo.
- Every upload gets a new storage key. Replacing or removing a logo never overwrites the old file, so documents already issued keep what they showed.
- Shown in settings and the hotels list. Used later on invoices, receipts, the booking engine and the guest app (in their bricks); not in the app's own shell, as the design says.
- **Remove** clears it, with an undo toast. Logos aren't personal data and live outside the private guest-ID bucket.

**Add a hotel: what happens**
- One transaction creates the hotel and its audit event. Its business date is the calendar date in its time zone at that moment (already built: `calendarDateIn`). It is **Setting up** until its first night audit.
- If the creator is limited to some hotels (a hotel-limited group admin), the new hotel is added to their access in the same transaction, so nobody creates a hotel they can't see.
- Everyone with whole-group access sees the new hotel in their hotel switch: the creator immediately, others on their next page load. People limited to hotels don't see it until someone gives them access. Once the group has 2 hotels, group-wide people get **All hotels** in the switch (already built).
- The creator's top bar switches to the new hotel, and its settings page shows **Next steps**:
  - **Set up rooms:** shown only once the Rooms page from brick 1 is built and the person has `rooms.setup`.
  - **Invite the team:** Members, with the invite sheet limited to the new hotel.
  - **Register devices:** Devices, with the register sheet bound to the new hotel.
- Each step ticks when done (at least one room, one other member with access, one device). The card stays until all three are done or it's dismissed. No step links to a page that doesn't exist yet.

**Change the owning company**
- Before go-live: the change applies at once.
- After go-live (forward rule, reachable only once brick 13 exists): needs a reason, and takes effect from the next business date, so a business date is never split between two companies' books.
  - Until then the field shows "Kora Hotels Abuja Ltd from 26 Nov 2026" with **Cancel change**. Cancelling also needs a reason and is a `setup_changed` exception too (added after code review: a scheduled change exists only on a live hotel, so undoing it is as reportable as making it).
  - Night audit applies the change as part of rolling the date.
  - Postings carry the company they were made under (bricks 10 and 13), so history never moves.

**Archive a hotel**
- Needs `setup.manage` and a reason, always: closing a hotel is rare and consequential.
- Refused when it's the group's last active hotel: "Kora Hotels Group needs at least one hotel."
- Also refused while the hotel has (forward rules, enforced by the brick that introduces the data):
  - in-house guests or future reservations that aren't cancelled (brick 4),
  - folios with a balance or open cashier shifts (bricks 9–10),
  - open POS checks (Stage 3).

  The dialog lists what's blocking, one line each with a count, and **Archive** stays disabled.
- In the same transaction:
  - The hotel gets `archivedAt`.
  - Every active device bound to it is revoked with the reason "Hotel archived: {reason}". Per decision 0022, everyone on it is signed out, its saved data is wiped when it reconnects, and queued commands are rejected and listed.
  - Pending invitations whose only hotel is this one are cancelled. Invitations and member access that also cover other hotels just lose this one from view.
  - Member access rows are kept, not deleted, so a restore brings access back.
- Afterwards:
  - The hotel leaves the hotel switch, Home, every picker and every list of hotels.
  - People whose only hotel it was see the existing "No hotel assigned yet" state.
  - A device that remembered it as the selected hotel falls back to the next hotel (already built). If one hotel is left, **All hotels** disappears from the switch.
  - Its rooms are untouched (not archived one by one). They stop counting in any group total from the next business date, and come back with the hotel.
  - Its business date stops; night audit never runs for an archived hotel.
  - Its audit trail, and later its folios, reports and ledger entries, stay readable, with "(archived)" after its name.
- An archived hotel is never deleted, and its name stays taken: "Kora Port Harcourt is archived. Restore it, or use another name."

**Restore a hotel**
- From the Archived filter, with `setup.manage` and a reason. It comes back with its rooms and member access.
- Devices stay revoked and must be registered again.
- If its owning company has since been archived, Restore asks for an active company first.
- For a hotel that never went live, the business date resets to the calendar date in its time zone. For one that was live, see Open questions.

**Settings › Companies**
- Header: "Companies" · "Kora Hotels Group · 3 companies", with the primary action **Add a company**.
- Follows the design's Legal entities table: Company, RC number, TIN, VAT, Hotels, Status. Two parts of the design wait for later stages (both logged in `CHANGES.md`):
  - the **Ledger** column appears with the ledger in Stage 5;
  - the **Departments** card and **Add department** aren't built, since DOMAIN's departments are a fixed list until Stage 5.
- **Hotels** lists the active hotels a company owns ("Victoria Island, Ikeja GRA, Lekki"); a company with none shows "No hotels".
- Filter chips **Active** (default) and **Archived**. Server-paginated (25 per page), sorted by name.

**Add or edit a company** (side sheet)
- **Legal name:** required, 2–120 characters, unique in the group including archived companies. Hint "As on the CAC certificate".
- **RC number:** optional, hint "e.g. RC 1184402 or BN 3456789". Accepted as a CAC prefix (RC, BN, IT, LP or LLP) and up to 8 digits; bare digits are read as RC. Stored as `RC 1184402`. Unique in the group when given.
- **TIN:** optional, digits with an optional hyphen, 8–14 digits (e.g. `21847390-0001`). Unique in the group when given. Format to verify (see Open questions).
- **VAT registered:** Yes / No, default No. Hint "Turns VAT on for this company's hotels' charges once taxes are set up".
- **Base currency:** "NGN (₦)", shown but not editable.

**Company rules**
- A company with no RC number or TIN shows "RC number and TIN missing" (amber) in the table and on the settings of every hotel it owns. Nothing is blocked in this brick. From brick 12, whether an invoice can be issued for a company with no TIN is that brick's rule (see Open questions).
- **Archive** needs `setup.manage` and a reason, and only works when no active hotel uses the company: "Kora Hospitality Ltd owns 3 hotels. Move them to another company first." Archived companies leave the owning-company picker; hotels already archived under them keep showing them. **Restore** is under the Archived filter.
- Once any hotel the company owns is live:
  - Changing the TIN or VAT registration asks for a reason.
  - A VAT registration change takes effect from the next business date of each hotel it owns. It is stored as a scheduled change on the company (`pendingVat`: the new value and the date, the day after the latest business date among its live hotels), shown as "VAT registered from 26 Nov 2026", and applied by night audit like a change of owning company (brick 13; brick 3 reads it for charges on or after that date). Choosing the current value again cancels it, with a reason. Before any of its hotels is live, the change applies at once. Tax lines already posted never change.
  - Name and RC number changes apply at once and appear on documents issued from then on. Issued documents never change.

**Home, navigation and ⌘K**
- Settings opens on **Hotels** for anyone who can see it (today it redirects to Members). Section order: Hotels, Companies, Members and roles, Devices, Permissions and limits.
- Home's setup checklist gains **Complete hotel and company details**. It's done when the selected hotel has a street, area and LGA and its owning company has an RC number and TIN.
- ⌘K (where built): "Hotels", "Add a hotel", "Companies", "Add a company", and each hotel's name opens its settings.

### Hotel switch (fits the next brick)
- These pages follow the rule the next brick applies everywhere: with **All hotels** selected, group-wide pages show everything; with one hotel selected, they show that hotel only.
- **Hotels:** All hotels shows the list; one hotel selected shows that hotel's settings. **Add a hotel** is in the header in both cases, since adding a hotel is group-level. A member who can see only one hotel always gets its settings.
- **Companies:** All hotels shows every company. One hotel selected shows only the company that owns it, with the line "Kora Victoria Island is owned by Kora Hospitality Ltd. Choose All hotels in the top bar to see every company." **Add a company** stays available.
- Page titles name the hotel or "All hotels" (`usePageTitle`), e.g. "Kora Victoria Island · Hotel settings", "All hotels · Companies".
- Server scoping doesn't change: the switch only narrows what the member may already see.

### Organization isolation
- Hotels and companies carry `organizationId`, and every read and write takes it from the session. A hotel or company id from another group answers "not found", including for the logo upload and confirm calls.
- Before a logo storage key is saved, the API checks it belongs to the same group and hotel.

### Property scoping
- Hotels: a member limited to some hotels sees and changes only those. A hotel-limited group admin can add a hotel, which joins their access. Another hotel's id answers "not found".
- Companies are group-level. A hotel-limited group admin sees every company's name, and the hotels it owns that they can see ("+ 1 other hotel" for the rest). They can edit or archive a company only if every active hotel it owns is within their access. Otherwise the sheet is read-only with "Kora Hospitality Ltd also owns hotels outside your access. Ask the owner."
- Archived hotels are visible only under the Archived filter, to `setup.manage` holders who could see them before.

### Permissions, limits and approvals
- **`setup.manage`** ("Manage companies, properties, people and their access": owner and group admin): see both pages; add, edit, archive and restore hotels and companies; upload logos.
- **Proposed new permission `property.operating_times`** ("Edit a hotel's check-in and check-out times"): general manager ✓ (their hotels), owner and group admin ✓, others –.
  - Why: the matrix today gives GMs nothing here, and `setup.manage` would also let them invite and change staff. This is the same reason rooms got `rooms.setup`.
  - A GM sees their hotel's settings read-only apart from the two times. Companies stays hidden.
  - If the owner declines it (Open question 1), GMs get no Settings › Hotels at all.
- People with neither permission don't see the sections. The API refuses with "Only the owner or a group admin can change hotel details. Ask the owner."
- No limits, so no approvals. A reason ("Recorded with your name.") is required for:
  - archiving or restoring a hotel or a company, always;
  - after go-live, changing a hotel's owning company or a company's TIN or VAT registration.
- PIN sessions on shared devices can't use these pages (already the rule for setup).
- Not behind any feature switch (Platform; decision 0021).

### Audit events
All written in the same transaction as the change. Each records actor, device, hotel, business date, before/after, the reason where given, and a `liveProperty` flag (the hotel has completed a night audit).
- Hotels: `property.created` (exists), `property.changed` (only the fields that changed), `property.logo_changed`, `property.logo_removed`, `property.entity_change_scheduled` and `property.entity_changed` (after go-live), `property.archived`, `property.restored`.
- Companies: `entity.created` (exists), `entity.changed`, `entity.archived`, `entity.restored`.
- Side effects of the same action, each its own event linked to the parent: `device.revoked` (reason "Hotel archived: …"), `invitation.cancelled`, `member.access_changed` (creator given the new hotel).
- The audit log viewer (#28, when built) shows them. Until then they're queryable and covered by tests.

### Leakage exceptions
- **New exception `setup_changed`**, for live hotels only, covering the changes that can move room nights or money out of sight:
  - a hotel archived or restored;
  - a hotel's owning company changed;
  - a company's TIN or VAT registration changed.

  Name, address, logo and times raise nothing.
- Owner's daily report lines (brick 16 turns the audit events into rows, in the report of each live hotel affected):
  - "Hotel archived · Kora Port Harcourt · Adaeze Okafor · Reason: lease ended 30 Nov 2026"
  - "Owning company changed · Kora Abuja: Kora Hospitality Ltd → Kora Hotels Abuja Ltd from 1 Dec 2026 · Adaeze Okafor · Reason: transfer to new company"
  - "VAT registration changed · Kora PH Ltd: registered → not registered · Adaeze Okafor · Reason: …"
- The exception shows even when the owner made the change, because a second owner or the MD reads the same report.

### Offline behaviour
- Settings need a connection. Offline, the pages show the cached data with the design's banner "Offline since 17:32. Settings are read-only while offline. Changes need a connection so every device gets them." Every field and button is disabled with "Needs a connection". Nothing is queued.
- The hotel list (with address, times and business date) stays cached on the device for the shell and the later front desk bricks.

### Business date
- A new hotel starts on the calendar date in its own time zone when it's created, and only night audit moves it (decision 0006).
- Before go-live, changing the time zone resets the business date to the calendar date in the new zone, since nothing has posted yet. After go-live the time zone is fixed.
- After go-live, owning-company and company VAT changes apply from the next business date, as above.
- "Go-live" means the hotel's first night audit has completed (the term proposed in the rooms spec).

### Tax lines
Not relevant in this brick: nothing is charged. The company's VAT registration is an input brick 3 will use. Whether a company that isn't VAT registered may or must charge VAT is a legal question (listed below), not decided here.

### Foreign currency
Not relevant. A company's base currency is NGN and can't be changed.

### Availability locking
Not relevant in this brick. Archiving is refused while a hotel has future reservations (from brick 4), so it never changes sold inventory. A restored hotel's rooms count again from its business date under brick 4's rules.

### Empty, error and edge cases
- **Empty:** Hotels and Companies are never empty, because onboarding creates one of each. The Archived filter with nothing in it shows "No archived hotels." / "No archived companies." → **Show active**.
- **Loading:** a skeleton matching the cards. **Load error:** the design's "Couldn't load settings. Nothing was changed. Your last saved settings are still in force." → **Try again**.
- **Name taken:** "Kora Lekki is already a hotel in this group." / "Kora PH Ltd is already a company in this group." If the name belongs to an archived hotel: "Kora Port Harcourt is archived. Restore it, or use another name."
- **RC number or TIN used by another company:** "RC 1184402 belongs to Kora Hospitality Ltd."
- **Someone else saved first** (each save sends the version it started from): "Tunde changed Kora Victoria Island at 14:02. Reload to see the change, then save again." Nothing is overwritten.
- **Company archived while the sheet was open:** "Kora PH Ltd was archived. Choose another company."
- **Logo problems:**
  - Too big or wrong type: "Use a PNG or JPEG up to 2 MB."
  - Too small: "This logo is 120 px wide. Use one at least 200 px on each side."
  - Upload interrupted: "The logo didn't upload. Try again." The old logo stays.
- **Archiving the hotel selected in your own top bar:** the switch moves to All hotels (or the remaining hotel), with the normal toast.
- **Archiving the hotel a GM is looking at:** their next request answers "This hotel was archived." with a link to Home.
- **Long names** ("Kora Victoria Island Serviced Apartments and Conference Centre") truncate with a tooltip in tables and the switch, and wrap in the sheet.
- **Phones (375px):** one column, with Save sticky at the bottom.
- **LGA before state:** the LGA picker is disabled with "Choose a state first".
- **Check-out later than check-in** (e.g. serviced apartments, check-in 12:00, check-out 14:00): allowed, no warning.
- **Creating a hotel at 00:20 Lagos time:** its business date is that new calendar day.

## Behind the scenes
- **Folio postings:** none.
- **Night audit:** never runs for an archived hotel. From brick 13, it applies a scheduled owning-company change when it rolls the date, and marks the hotel live after its first run.
- **Ledger:** none now. Postings and journals carry the owning company at the time (bricks 10 and 13, and Stage 5), so a change of owner never rewrites history.
- **Jobs:** none for the main path; logo checks run inside the confirm call. A daily cleanup job removes orphaned uploads (signed URL issued, never confirmed) after 24 hours.
- **Notifications:** none in app. Exceptions reach the owner's daily report (brick 16).
- **Storage:** this is the first use of object storage. It adds:
  - the storage interface the stack describes (S3 API only: R2 in production, RustFS locally);
  - signed PUT and GET URLs;
  - a non-private assets location, separate from the guest-ID bucket.
- **API (for the architect):**
  - `properties.list` gains an Active/Archived filter (archived only for `setup.manage`), and returns the owning company's name, status (setting up or live), room count and logo URL.
  - New: `properties.update`, `properties.archive` (with a preview of what it affects), `properties.restore`, `properties.logoUploadUrl`, `properties.setLogo`, `properties.removeLogo`.
  - `entities.list` gains the filter and the hotels each company owns. New: `entities.get`, `entities.update`, `entities.archive`, `entities.restore`.
  - Street, area and LGA become required when adding or editing a hotel. Onboarding, which sends only the state, keeps working because these fields stay optional on that one path.
- **Data import at go-live:** none. A group has a handful of hotels and companies, and they're entered here. Brick 17's imports choose the hotel on screen, never per row.

### Demo seed
The design shows three companies; the seed has one. Align the seed with the design (the journeys follow the designs):

| Company | RC number | TIN | VAT | Owns |
|---|---|---|---|---|
| Kora Hospitality Ltd | RC 1184402 | 21847390-0001 | Yes | Kora Victoria Island, Kora Ikeja GRA |
| Kora Hotels Abuja Ltd | RC 1290517 | 22910455-0001 | Yes | Kora Abuja |
| Kora PH Ltd | RC 1377281 | 23308817-0001 | Yes | Kora Port Harcourt |

- Full addresses:
  - Kora Victoria Island: Plot 1412 Ahmadu Bello Way, Victoria Island, Eti-Osa, Lagos (from the design).
  - The other three get a street in their walkthrough area: Ikeja GRA, Ikeja, Lagos; Wuse 2, Abuja Municipal, FCT; GRA Phase 2, Obio-Akpor, Rivers.
- Check-in 14:00 and check-out 12:00 everywhere. A placeholder Kora logo on Kora Victoria Island only, so the owner sees both states.
- Kora Lekki is **not** seeded. It's the hotel the owner adds in review (flow B), matching the design's "Victoria Island, Ikeja GRA, Lekki" for Kora Hospitality Ltd.
- The walkthroughs (`journeys/README.md`, the golden thread) only need Kora Victoria Island under Kora Hospitality Ltd, so giving Abuja and Port Harcourt their own companies changes nothing else.
- Kora Ikeja GRA is left without a street, so flow A can be tried on it.

### Owner's review (what to try)
- Sign in as `adaeze@kora.example`:
  1. Complete Kora Ikeja GRA's address.
  2. Add Kora Lekki and invite its GM from Next steps.
  3. Add a company and move Kora Lekki to it.
  4. Archive Kora Lekki, then restore it.
  5. Upload a logo, then remove it.
- Sign in as `tunde@kora.example`: change the check-out time, and check that everything else is read-only and Companies isn't there.

### Changes needed in `docs/DOMAIN.md`
1. **Property** row: "Shown in the app as **hotel**. Name (unique in the group, archived included), logo (PNG or JPEG), address (street, area, LGA, state; Nigeria only), time zone (default `Africa/Lagos`, fixed once live), check-in and check-out times, current business date, owning entity. Status **setting up** until its first night audit, then **live**. Archived, never deleted: devices revoked, access kept for a restore."
2. **Entity** row: "Shown in the app as **company** (Settings › Companies, 'Owning company'). Legal name, RC number (CAC prefix RC, BN, IT, LP or LLP), TIN, VAT registered, base currency NGN. Archived only when it owns no active hotel. A change of owning company or VAT registration on a live hotel applies from the next business date."
3. **Company (corporate account)** row: add "Shown in the app as **corporate account** (or 'corporate'), never 'company' alone, so it isn't confused with the group's own companies." The matrix label "Exceed a company's credit limit" becomes "Exceed a corporate account's credit limit" (same in `packages/shared/src/permissions.ts`).
4. **Permissions matrix:** new row "Edit a hotel's check-in and check-out times" (`property.operating_times`): general_manager ✓, owner / group_admin ✓, others –. Same row in `packages/shared/src/permissions.ts` (Setup group). Note under the matrix: "Archiving or restoring a hotel or company needs a reason."
5. **Go-live** (if the rooms spec hasn't already added it): "A property is live once its first night audit has completed."
6. **Exception** list: add "setup changed (live hotel archived or restored, owning company changed, company TIN or VAT registration changed)".
7. **Locale defaults:** "Nigerian states and LGAs from a fixed list" now names the source data in `@vento/shared` (36 states + FCT, 774 LGAs).

### Changes needed in other docs (same change as the build)
- `docs/specs/stage-1-plan.md`: add this brick at the top of the table ("0 · Hotels and companies", lead backend + frontend).
- `docs/journeys/going-live.md`:
  - Step 1: onboarding asks only for the group, company and hotel names and the state.
  - New step 1b: Mrs Okafor completes the address, logo, RC number, TIN and VAT in Settings › Hotels and Companies.
  - New closing section "Later: opening Kora Lekki", with flow B and what can go wrong (name taken, archived company).
  - Becomes tests: an added hotel appears in the switch; archiving revokes devices; a GM edits only the times.
- `docs/journeys/README.md` demo world: three companies, as in the seed table above.
- `docs/design/screen-inventory.md`: mark the #25 rows built when done.
- `docs/design/CHANGES.md`: no SVG logos; no Night audit at field yet; no departments or Ledger column yet; a per-field "applies" rule instead of the subtitle; "Entities and departments" named "Companies"; "Property" named "Hotels".

## UI copy
- **Nav:** "Hotels", "Companies".
- **Pages:**
  - "Hotels" · "Kora Hotels Group · 4 hotels"
  - "Kora Victoria Island" · "Hotel settings · Owned by Kora Hospitality Ltd"
  - "Companies" · "Kora Hotels Group · 3 companies"
- **Buttons:** "Add a hotel", "Add hotel", "Save changes", "Upload", "Remove", "Edit company", "Add a company", "Save company", "Archive hotel", "Archive Kora Port Harcourt", "Archive company", "Restore", "Cancel change", "Set up rooms", "Invite the team", "Register devices", "Show active", "Try again", "Discard changes"
- **Fields and hints:**
  - "Hotel name"
  - "Owning company" — "Invoices, VAT and the ledger use this company"
  - "Street" (e.g. Plot 1412 Ahmadu Bello Way) · "Area" (e.g. Victoria Island) · "State" · "LGA" — "Choose a state first"
  - "Time zone" · "Check-in from" · "Check-out by"
  - "Legal name" — "As on the CAC certificate"
  - "RC number" — "e.g. RC 1184402 or BN 3456789"
  - "TIN" — "e.g. 21847390-0001"
  - "VAT registered" — "Turns VAT on for this company's hotels' charges once taxes are set up"
  - "Base currency · NGN (₦)"
- **Logo:** "Hotel logo · PNG or JPEG, up to 2 MB" · "Used on invoices, receipts, the booking engine and the guest app. Not on Vento screens."
- **Banners:**
  - "Add Kora Victoria Island's address. Registration cards, invoices and guest messages use it."
  - "Kora Hospitality Ltd · RC number and TIN missing"
  - "Offline since 17:32. Settings are read-only while offline. Changes need a connection so every device gets them."
- **Business date:** "Business date 12 Nov 2026 · No night audit yet. The first one makes this hotel live." / "Only night audit moves this date"
- **Statuses:** hotels "Setting up", "Live", "Archived"; companies "Active", "Archived", "No hotels".
- **Next steps card:** "Next steps for Kora Lekki" · "Set up rooms" · "Invite the team" · "Register devices"
- **Toasts:** "Kora Lekki added" · "Kora Victoria Island saved" · "Logo saved" · "Logo removed · Undo" · "Kora PH Ltd added" · "Kora Hospitality Ltd saved" · "Kora Port Harcourt archived" · "Kora Port Harcourt restored"
- **Archive dialog:**
  - Title: "Archive Kora Port Harcourt?"
  - Body: "It leaves the hotel switch and every list. Its 72 rooms, history and reports are kept. 3 devices are signed out and revoked. 4 people work only here and will have no hotel until you give them another."
  - "Reason for archiving" (required) · "Recorded with your name."
  - Button: "Archive Kora Port Harcourt"
- **Archive blocked:** "Kora Port Harcourt can't be archived yet:", then one line each, e.g. "12 guests in house" · "38 future reservations" · "2 folios with a balance" · "1 open cashier shift"
- **Owning company after go-live:** "Kora Hotels Abuja Ltd from 26 Nov 2026" · "Reason for changing the owning company"
- **Errors:**
  - "Kora Lekki is already a hotel in this group."
  - "Kora Port Harcourt is archived. Restore it, or use another name."
  - "RC 1184402 belongs to Kora Hospitality Ltd."
  - "Kora Hotels Group needs at least one hotel."
  - "Kora Hospitality Ltd owns 3 hotels. Move them to another company first."
  - "Tunde changed Kora Victoria Island at 14:02. Reload to see the change, then save again."
  - "Kora PH Ltd was archived. Choose another company."
  - "Use a PNG or JPEG up to 2 MB."
  - "This logo is 120 px wide. Use one at least 200 px on each side."
  - "The logo didn't upload. Try again."
  - "The time zone is fixed once a hotel is live."
  - "This hotel was archived."
  - "Needs a connection"
- **Permission:** "Only the owner or a group admin can change hotel details. Ask the owner." · "Kora Hospitality Ltd also owns hotels outside your access. Ask the owner."
- **One hotel selected on Companies:** "Kora Victoria Island is owned by Kora Hospitality Ltd. Choose All hotels in the top bar to see every company."
- **Empty (Archived filter):** "No archived hotels." / "No archived companies."

## Out of scope
- Departments and the Ledger column (Stage 5); the night audit time (brick 13); star rating; the hotel's phone, email and front desk WhatsApp number; bank details for deposits (brick 3 payment methods); photos and descriptions for guests (Stage 4).
- Members limited to companies (entity limits) and finance scoping by company (Stage 5).
- Hotels outside Nigeria; a company base currency other than NGN.
- Deleting a hotel or company; merging companies; moving rooms between hotels.
- Subscription limits on the number of hotels (Stage 6 billing); groups with more than 100 hotels in the switch.
- Licences and permits per hotel (screen #42, Stage 2).
- A public URL for the logo (decided with the booking engine, Stage 4).

## Open questions
These go beyond the agreed scope. The build follows the stated default unless the owner decides otherwise.
1. **GM permission (owner):** add `property.operating_times` so GMs can change their hotel's check-in and check-out times? Default: yes, as specced. If no, GMs don't see Settings › Hotels.
2. **"Company" vs corporate account (owner):** the app already says "Company" for legal entities (onboarding), while DOMAIN uses "company" for corporate accounts. Default: legal entities are "companies" in the app, corporate accounts are "corporate accounts", and DOMAIN and the matrix label change as listed. Confirm before brick 12 names its screens.
3. **Business date before go-live (owner, from `going-live.md`):** a hotel set up on 12 Nov that goes live on 16 Nov would show business date 12 Nov (amber in the top bar) for four days. Default for this brick: it starts at the creation date, as agreed. Recommendation for brick 13: until the first night audit, the business date follows the hotel's calendar date, since nothing has posted.
4. **Restoring a hotel that was live (owner, for brick 13):** months after closing, its business date is months behind. Should night audit catch up day by day, or should a single logged "reopened on" date be set at restore? The second breaks decision 0006 ("only night audit moves the date") and would need a decision that supersedes it. Default: restore keeps the old date; brick 13 decides before any live hotel can be archived.
5. **Time zone after go-live (owner):** fixed once live (default). Every Nigerian hotel is on `Africa/Lagos`, so this only matters for a hotel abroad, which is out of scope.
6. **TIN and RC formats (legal, verify against current law):** the 2025 tax acts (Nigeria Tax Administration Act) bring a single Tax ID administered with the JTB and the NRS (formerly FIRS); older TINs look like `21847390-0001`. Confirm the current format or formats and whether both must be accepted, and confirm CAC's current number prefixes (RC, BN, IT, LP, LLP). Validation stays loose until then.
7. **VAT registration as yes/no (finance or legal, before brick 3):** under the Nigeria Tax Act 2025, confirm whether a company that isn't VAT registered (or is under the small-company threshold) must not charge VAT, and whether "VAT registered" is enough or brick 3 needs a registration date and a VAT-exempt reason. The flag here is only an input; brick 3 owns the rule.
8. **Invoices without a TIN (finance, before brick 12):** block issuing an invoice for a company with no TIN, or warn? This is relevant to e-invoicing under NRS guidance (already an open question in DOMAIN).
9. **Demo world (owner):** adopt the design's three companies in the seed and journeys (default), with Kora Lekki added in demos rather than seeded.
