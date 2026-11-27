# Vento console: groups, feature switches, trials, failed jobs and read-only support

- **Status:** approved (owner, 2026-11-27)
- **Stage:** 1, brick **5b** (after approvals, before data import and going live). Depends on Stage 0 (sign-in, two-step, feature switches, audit events, jobs) and brick 5 (the PIN check the owner's grant reuses).
- **Module:** Platform
- **Walkthroughs:** `going-live.md` steps 1a, 2 and 14 and "Support access expires mid-task" (changed); a new `vento-console.md` (Seyi's day: switch on a pilot, extend a trial, retry a job, help Kora through a support view)
- **Screens:** Vento console (pattern, internal; screen inventory "Running Vento as a business"); Account and support, support view (#46, `Account.dc.html` view "support")
- **Decisions:** builds on 0017, 0019, 0021, 0023 and 0025. Needs a new **0027 · The Vento console** (staff accounts, fresh two-step, read-only support view by declaration) that supersedes 0021's "Who switches" bullet and amends 0023 for staff. Reuses Vento Real Estate's console spec and its decision 0021, minus releases, plans, AI, the customer-activity Dashboard, passkeys and billing.

## Problem
The first pilot group goes live in a few weeks, and the Vento team has no safe way to run it. Switching front desk on for Kora means a terminal on the server, and the group's audit log can only say "Vento team", not who. Nobody can see which groups are on a trial or when it ends. A failed confirmation email sits in the queue tables where only an engineer can find it. And when Tunde rings at 10:20 with "my room import looks wrong", nobody at Vento can see what he sees without asking for a password, which nobody should ever do. The Vento team needs one place, separate from every hotel group's workspace, to run groups, switches, trials and failed jobs, and to look at a group read-only with the owner's consent, with every action tied to a real person who signed in with two-step.

## Persona and job
| Who | Job | Device, how often |
|---|---|---|
| **Vento staff** (Seyi Bankole, onboarding and support) | Switch modules on for a pilot, set a trial's end date, answer "why can't we see X?", retry a failed email, look at a group's setup during a call | Laptop, daily during pilots; phone for a quick check |
| **Group owner** (Mrs Adaeze Okafor, Kora Hotels Group) | Decide whether Vento support may look at the group, for how long and at which hotels; see what support did; know when the trial ends | Laptop or phone, a few times during go-live |
| **Every other member** | Nothing. The console doesn't exist for them. | Never |

Name note: the design's support log shows "Adaeze from Vento support", which clashes with the demo owner. Vento staff in this spec, the seed and the journeys is **Seyi Bankole** (the design's second support row already uses Seyi).

## Success looks like
- Switching front desk on for Kora takes **3 clicks** from the console's Groups page, and Kora's audit log shows it within the same transaction.
- **Zero console procedures answer** anyone who isn't active Vento staff with a fresh two-step window: a walk test calls every one as a Kora owner, as staff without a fresh second factor and as removed staff, and gets *not found* each time.
- **A support view writes nothing:** a walk test calls every customer write procedure inside a support view and each is refused before any row is read or written. A test fails if a customer procedure doesn't declare `read` or `write`.
- An owner grants support access in **3 clicks and a PIN**, and revokes it in **2 clicks**.
- "Why can't Kora see Restaurant & bar?" is answered in **2 clicks** (search, group; the feature's row says why).
- A failed email is found and retried in **3 clicks**, without anyone seeing its text.
- **Customers never download console code:** the customer entry's bundle budget doesn't move (bundle check).
- Every console action is in the platform activity trail with the staff member's name; no `--by` typed by hand outside break-glass.

## User flow
Demo world: Kora Hotels Group (owner Mrs Adaeze Okafor), Kora Victoria Island, business date 25 Nov 2026. Vento staff: Seyi Bankole.

**A. Switch front desk on for the pilot (3 clicks)**
1. Seyi signs in with password and authenticator code and lands on **Groups** (no extra step: the code was just entered).
2. Types "Kora" in search, clicks **Kora Hotels Group** (1).
3. In **Features**, Front desk reads "Off · not released yet". **Switch on** (2) opens a confirm: "Switch on Front desk for Kora Hotels Group? Its members see Front desk on their next page. Nothing else changes." Reason "Pilot from 1 Dec" → **Switch on Front desk** (3).
4. Toast "Front desk switched on for Kora Hotels Group". The row reads "On · switched on for this group · Pilot from 1 Dec · Seyi, 26 Nov". Kora's audit log reads "Vento team switched on Front desk".

**B. Owner gives support access (3 clicks + PIN)**
1. Mrs Okafor opens Settings › **Account and support** › Support access and clicks **Give access** (1).
2. The sheet: Access **Read only** (the only choice), For **24 hours** (default; 1 hour and 3 days beside it), Hotels **Kora Victoria Island** (the hotel selected in the top bar; with All hotels, every hotel), Reason "Help with the room import". She taps **3 days** (2), then **Grant access** (3) and enters her PIN.
3. Toast "Support can view Kora Victoria Island until 28 Nov, 10:21". The grant shows as Active with **Revoke now**.

**C. Seyi looks, read-only (3 clicks)**
1. Group detail shows "Support access · Read only · Kora Victoria Island · until 28 Nov, 10:21". **Open support view** (1) → confirm "Open a read-only view of Kora Hotels Group? Mrs Okafor sees every page you open." → **Open read-only view** (2).
2. Kora's workspace opens in a new tab on Home, Kora Victoria Island, with the amber banner "Support view · Kora Hotels Group · read only · ends 28 Nov, 10:21" and **Leave**. Buttons are in place but disabled ("Read-only support view").
3. He opens Rooms, sees the duplicated floor 8, tells Tunde on the call which line to fix, and clicks **Leave** (3).
4. Mrs Okafor's **What support did** lists "Seyi (Vento support) · Opened Rooms · Kora Victoria Island" and "Signed in with the access you granted".

**D. Retry a failed email (3 clicks)**
**Failed jobs** (1) → row "Kora Hotels Group · Email · Provider timed out · 6 of 6 tries" → **Retry** (2) → reason "Provider back up" → **Retry job** (3). Toast "Job queued again".

**E. Extend a trial (3 clicks)**
Group → Trial card **Change end date** (1) → pick 31 Jan 2027 (2) → reason → **Save end date** (3). Toast "Trial now ends 31 Jan 2027". Kora's audit log: "Vento team changed the trial end date to 31 Jan 2027".

**F. First staff member (once per environment)**
`pnpm staff invite --bootstrap --email seyi@vento.example --name "Seyi Bankole"` prints a one-time 48-hour link → Seyi sets a password → sets up the authenticator app → saves backup codes → lands on Groups.

## Acceptance criteria

### Main path
**Where the console lives**
- Given the web app, then the console is its own route tree `/console` on the same origin (decision 0019) with its own shell: navy sidebar with the "Vento | Hotels" lockup and a fixed amber label **Vento staff · all groups** on every page at every width; no hotel switch, no customer modules, no ⌘K customer actions, no setup checklist, no role preview. Tab title "{page} · Vento console". Nav: **Groups · Failed jobs · Activity · Vento team**; on phones the same four as bottom tabs.
- Given anyone who isn't active Vento staff (signed out, a Kora owner, removed staff), when they open `/console` or any path under it, then they get the standard not-found page, decided by a `beforeLoad` that loads only the session; the console chunk is never requested.
- Given console procedures, then they sit in their own contract subpath (`@vento/shared/console`, never exported from the package root) and router chain (session → active staff → two-step on → open console window), never on the member chain; they take no organization from the session and name a group only by id in the input.

**Sign-in and two-step**
- Given staff, then two-step (authenticator app, decision 0023) is required, set up before the account can open anything, and can't be turned off; "Trust this computer for 30 days" isn't offered.
- Given staff whose last second factor (code or backup code, never a password) is older than 5 minutes, when they open the console, then "Confirm it's you" asks for a code. The proof opens a **console window** that ends after 15 minutes without console activity, 8 hours after it opened, at sign-out, or when the person is removed. When it ends mid-task, the dialog and typed reason stay and the action runs after the code.
- Given staff, then the account is a staff account (decision 1 below): never a member of a group, can't create a group or accept a customer invite; any customer path redirects to `/console`.

**Groups list** (`/console`)
- Header "Groups" and "3 groups · 9 hotels · 31 people". Four stat cards, each filtering the list: **Groups** ("+1 in the last 7 days"), **On trial** ("1 ends in 7 days"), **Pilot features** (groups with a switch on for a feature not yet released), **Failed jobs** (last 24 hours, "in 2 groups").
- Chips: All · On trial · Trial ending · Pilot features · Failed jobs · Support open. Search: group name, slug or owner email. URL keeps chips, search and page. Server-paginated (`{ items, page, pageSize, total }`).
- Columns: Group (owner name under it) · Hotels · Rooms · People · Last active · Trial ("ends 31 Dec 2026 · 36 days", amber within 7 days) · Support ("Open until 28 Nov", blue). Sorted by last active. Below `md`: cards with name, owner, trial and last active.

**Group detail** (`/console/groups/:id`)
- Header: name, slug, "Owner Mrs Adaeze Okafor (adaeze@kora.example) · since 12 Nov 2026". Action **Open support view**, enabled only with an active grant ("No support access. Mrs Okafor can grant it from Account and support." otherwise).
- **Hotels:** name, state, active rooms, status Setting up or "Live since 17 Nov 2026", business date. **People:** members, pending invites, last active. **Trial** (below). **Features** (below). **Support access:** current grant (access, hotels, until, granted by) and "2 earlier grants". **Failed jobs:** count in 24 hours with a link to the filtered list. **Recent Vento changes:** this group's platform activity, newest first, with **See all**.
- **Facts only:** names and counts of hotels, rooms and people, dates, and the owner's name and email. Never guest data, money, staff names beyond the owner, ID numbers or files. A response-scan test fails if any other member's name or email appears.

**Feature switches**
- Given the Features card, then every catalog feature is listed with On (emerald) or Off (slate) and one reason, from `listGroupFeatures`: "On for every group" (released) · "Not released yet" · "Switched on for this group · {reason} · {staff}, {date}" · "Switched off for this group · {reason} · …" · "Off because {module} is off".
- Given **Switch on**, **Switch off** or **Back to default** with a reason (trimmed, at least 3 characters), then the console calls the same `switchFeature` operation as `pnpm features`, in one transaction writing the same `organization_features` row, the same group audit event (`feature.switched_on|off`, `feature.reset`, actor "Vento team") and a platform activity event naming the staff member.
- Given two staff on the same row, when the second confirms after the first changed it, then it's refused ("Front desk was switched on a moment ago by Seyi. Check and try again.") and the card refreshes. Each change carries the state it was shown and an idempotency key; a retry never applies twice.
- Given the command line after this brick, then `pnpm features list` works as today and on/off/reset (decision 3 below).

**Trials**
- A trial is a start date and an end date on the group (Lagos calendar dates, not a business date). Until billing (Stage 6) it is a label and a reminder, nothing more: no feature, limit or sign-in depends on it (decision 5 below).
- New groups start (decision 4 below). Staff can **Start trial** (end date, default 30 days from today), **Change end date** (tomorrow to 12 months ahead) and **End trial** (today), each with a reason; each writes a platform event and a group audit event ("Vento team changed the trial end date to 31 Jan 2027").
- Given an owner, from 7 days before the end date, then Home shows "Your Vento trial ends on 31 Dec 2026. Nothing stops working. Vento will contact you about your plan." and Account and support shows the end date. After it ends, for 7 days on Home and always on Account: "Your Vento trial ended on 31 Dec 2026. Nothing has stopped. Vento will contact you about your plan." Other roles see nothing.

**Failed jobs** (`/console/jobs`)
- Health line first: "Background jobs running · last heartbeat 14:31" or rose "Background jobs stopped · no heartbeat for 6 minutes" (from the latest completed `system.heartbeat` job, so any API server answers the same).
- List of jobs in state failed or retrying: time, group (or "Vento" for platform jobs), job in words ("Email", "Upload clean-up"), error summary, tries ("6 of 6"), state (Failed rose, Retrying amber). Chips: All · Failed · Retrying; filter by group. Server-paginated.
- **Never shows a payload.** Email jobs hold sign-in links (decision 0025). The error summary is the first line of the error message, at most 140 characters, with emails, phone numbers and link tokens masked; no stack traces. A test seeds a failure whose message contains an email and a link and checks neither reaches the response.
- **Retry** (failed) and **Discard** (failed or retrying), each with a reason, call pg-boss's own retry and delete; platform event `job.retried` / `job.discarded` with queue, job id and group. Discard confirm: "Discard this email job? It won't be sent. The person can ask for the email again."

**Support access (customer side, design #46)**
- Given an owner on Account and support, when they **Give access**, then they choose For (1 hour, **24 hours**, 3 days), Hotels (one or more of the group's hotels, default the selected hotel, all with All hotels) and a Reason, and confirm with their staff PIN (or their password if they have no PIN). Access is **Read only**; the design's "Read and fix" is hidden (decision 2 below).
- One active grant per group: giving access again replaces it (that's how it's extended). Any owner can **Revoke now** without a PIN.
- The page lists grants (who, access and hotels, until, reason, Active / Expired / Revoked) and **What support did**: grants and revokes, each view opened and closed, and each page opened (page name and hotel, plus a record reference such as a confirmation number, never a guest's name), newest first, last 90 days.
- Owners are emailed once per grant, the first time support opens a view: "Vento support is looking at Kora Hotels Group".

**Support view (staff side)**
- Given an active grant, when staff **Open support view**, then a support view starts, scoped to that group and the grant's hotels, and the customer workspace opens in a new tab with the amber banner on every page at every width and **Leave**.
- Sees what an owner of those hotels sees, on screen only: ID numbers masked with no reveal; no guest ID images, file downloads, exports or PDFs; no My account, sessions, PINs or two-step of anyone; no Account and support page.
- **Changes nothing:** every customer procedure declares `read` or `write` in its contract meta; in a support view every `write` answers FORBIDDEN `SUPPORT_READ_ONLY` before it reads or writes anything. Reads with side effects (last active, notifications read, checklist dismissals) are skipped. Buttons stay in place, disabled.
- Not a member: never in Members, never counted as a person or as "last active", gets no notifications.
- **Ends** on **Leave**, at the grant's end, when an owner revokes, when the granting owner stops being an owner, or when the staff member's console window ends or they're removed. The check runs on every request, so the next click after any of these lands on "Support view ended" with the reason.

**Vento team** (`/console/team`)
- List: name, email, joined, invited by, last console use. **Invite** (email, name, reason; 48-hour link; at most 5 open), ⋯ **Reset two-step** and **Remove**, each with a reason. Nobody removes themselves or resets their own two-step; there's always at least one active staff member. Removing closes the account: sessions end, the authenticator is removed, the name stays on past activity. Every other staff member is emailed on invite, join, reset and removal.

**Activity** (`/console/activity`)
- The platform trail, newest first: when, who, what in words ("Switched on Front desk for Kora Hotels Group"), group, before → after, reason, channel (Console, or a rose **Command line** tag). Filters: person, group, kind, date. Read-only, no export.

### Organization isolation
- A console procedure only ever names a group by id in its input and is reachable only through the console chain. A walk test checks every console procedure is on it and no customer procedure is.
- A support view carries exactly one group: a guessed id from another group answers 404, as for any member. The request's audit context carries both the staff member and the group.

### Property scoping
- In a support view, the hotel switch offers only the grant's hotels (All hotels only if the grant covers more than one); group pages show only data within them, exactly as for a member limited to those hotels (`propertyScope()`); another hotel's ids answer `PROPERTY_NOT_FOUND`.
- The console's group detail lists every hotel's name, rooms and status (facts) whatever the grant.

### Permissions, limits and approvals
- **Give or revoke Vento support access:** owner only (new matrix row; Open question 6). Granting needs the owner's PIN or password; revoking doesn't. Refused in a PIN session on a shared device.
- **Console actions:** any active Vento staff member, one role, no limits. Every change needs a reason. No second approver while the team is small (out of scope); break-glass changes email every other staff member.
- Nobody acts on themselves: no self-removal, no self reset of two-step. Staff can't open a support view without a live grant, can't extend a grant, and can't see a group's Account and support page.

### Audit events
- **Platform activity (new, append-only):** `staff.invited`, `staff.invitation_resent`, `staff.invitation_withdrawn`, `staff.joined`, `staff.two_step_reset`, `staff.removed`, `console.opened`, `feature.switched_on|off`, `feature.reset`, `trial.started`, `trial.changed`, `trial.ended`, `job.retried`, `job.discarded`, `support.view_opened`, `support.view_closed` (with how: left, expired, revoked, owner changed, window ended, staff removed). Each: staff id and name, channel (`console`, `command`, `scheduled`), operator ("console · Chrome on Mac · 102.89.••.14" or the host user), group, before → after, reason, idempotency key.
- **Group audit log (existing table):** `feature.*` and `trial.*` with actor "Vento team" and the reason; `support.access_granted` (owner, access, hotels, until, reason, device), `support.access_revoked` (owner), `support.view_opened` and `support.view_closed` with actor "Seyi (Vento support)". Expiry writes no event; it shows from the grant's end time.
- Page views go to `support_view_pages`, not the audit log, so the audit log isn't flooded.

### Leakage exceptions
Not relevant: no hotel money or room nights move. Support access is the owner's own decision and shows on Account and support and in the email, not in the owner's daily report.

### Offline behaviour
The console and a support view need a connection: "You're offline. The Vento console needs a connection." A support view never registers the offline outbox or caches the group's data on the staff member's device. Granting and revoking need a connection (design #46: "Granting or revoking access needs a connection.").

### Business date
Not relevant to postings. Trial dates are Lagos calendar dates. A support view shows each hotel's business date as usual and can't run night audit.

### Tax lines
Not relevant.

### Foreign currency
Not relevant.

### Availability locking
Not relevant: nothing here changes sellable rooms (a support view can't write).

### Empty, error and edge cases
- Groups empty: "No groups yet. They appear here when someone finishes signing up." Filtered: "No groups match these filters." → **Clear filters**. Failed jobs empty: "No failed jobs. Background work is running normally."
- Unknown or retired feature key in `organization_features`: listed under "No longer in the catalog · ignored", never switchable.
- Retry of a job pg-boss no longer keeps: "This job is no longer kept, so it can't be retried."
- Trial end date in the past, more than 12 months ahead, or a reason under 3 characters: the field says what's needed; nothing is sent.
- Grant with no hotel ticked: "Choose at least one hotel." Grant naming an archived hotel: refused ("Kora Port Harcourt was archived.").
- Owner's PIN wrong 5 times: locked as for any PIN (decision 0022); password still works.
- The granting owner is removed or changes role: the grant ends at once and any open view closes ("Support access ended because Mrs Okafor is no longer an owner").
- Staff open two support views: opening a second closes the first.
- Network failure on confirm: "Couldn't reach Vento. Your change wasn't made. Try again." with the reason kept.

## Behind the scenes
- **Folio postings, night audit, ledger:** none. A support view can't post, void or run an audit.
- **Data (migration):**
  - `staff_accounts` (user id, name, email, status active / removed, invited by, joined, removed) and `staff_invitations` (email, name, invited by, token hash, expires, status `pending → accepted / expired / withdrawn`).
  - `platform_audit_events`, append-only (trigger as on `audit_events`), with a nullable `organization_id`. Like `staff_accounts`, it's platform-level and never read by a customer procedure: an exception to "every domain table has `organizationId` NOT NULL" that decision 0027 records.
  - `support_grants` (organization, granted by, access `read`, hotels or all, reason, starts, ends, revoked at and by) and `support_views` (organization, grant, staff, opened, closed, how); `support_view_pages` (view, organization, page, hotel, record reference, time), append-only.
  - `organizations.trial_started_on`, `organizations.trial_ends_on` (dates, nullable).
  - `sessions.second_factor_at`, `console_opened_at`, `console_active_at`, `support_view_id`. A test pins that a password confirmation never stamps `second_factor_at`.
- **Jobs:** the console reads the `pgboss` schema through one narrow query (state, queue, times, retry count, error message) and never selects `data` except one field: jobs that belong to a group carry `organizationId` in their data (added to the email job and future group jobs). Failed email jobs must stay listed for 24 hours without exposing their text; today they're deleted after an hour (decision 0025): the architect keeps failed jobs longer than finished ones, or blanks a failed email job's text when its last try fails.
- **Commands:** `pnpm staff invite --bootstrap` works only with no active staff, prints a 48-hour link, actor "Vento (setup)", channel `command`. `pnpm features` (decision 3 below).
- **Notifications (email):** support view opened (owners, once per grant); staff invited, joined, reset, removed (the person and other staff); break-glass change (other staff).
- **Getting onto it:** no customer data to import. At deploy, existing groups get no trial unless staff set one; the first staff member is bootstrapped by the command.
- **Seed:** Seyi Bankole (`seyi@vento.example`) as staff; Kora on a trial ending 31 Dec 2026, front desk switched on with reason "Pilot", an active 24-hour read-only grant for Kora Victoria Island by Mrs Okafor and one past view with three pages; two small groups (Eko Suites, trial ending in 3 days; Palm Court Hotel, trial ended); one failed and one retrying email job for Kora.

## UI copy
| Where | Copy |
|---|---|
| Staff label | "Vento staff · all groups" |
| Confirm it's you | "Confirm it's you" · "Enter a code from your authenticator app to open the Vento console." · **Confirm** · "Use a backup code" |
| Window ended | "Your console session timed out. Enter a code to carry on. Your change is still here." |
| Groups | "Groups" · "3 groups · 9 hotels · 31 people" · cards "Groups", "On trial", "Pilot features", "Failed jobs" · search "Find a group" |
| Feature reasons | "On for every group" · "Not released yet" · "Switched on for this group · Pilot from 1 Dec · Seyi, 26 Nov" · "Off because Front desk is off" |
| Switch confirm | "Switch on Front desk for Kora Hotels Group?" · "Its members see Front desk on their next page. Nothing else changes." · **Switch on Front desk** / "Switch off Front desk for Kora Hotels Group?" · "Its members stop seeing it. Its data is kept." · **Switch off Front desk** / **Back to default** |
| Reason field | "Reason" · "Kept in Vento's activity. The group's audit log shows it too." · "Add a reason so the activity says why." |
| Trial | "Trial · ends 31 Dec 2026 · 36 days" · **Change end date** · **End trial** · **Start trial** · toast "Trial now ends 31 Jan 2027" |
| Trial (owner) | "Your Vento trial ends on 31 Dec 2026. Nothing stops working. Vento will contact you about your plan." · "Your Vento trial ended on 31 Dec 2026. Nothing has stopped. Vento will contact you about your plan." |
| Failed jobs | "Failed jobs" · "Background jobs running · last heartbeat 14:31" · "Background jobs stopped · no heartbeat for 6 minutes" · **Retry** · **Discard** · toasts "Job queued again", "Job discarded" |
| Grant (owner) | "Give Vento support access" · "Access: Read only" · "For" · "Hotels" · "Reason" (e.g. Help with the room import) · "Support never sees full ID numbers or card details, and can't change anything. Everything they open is listed here and in the audit log." · **Grant access** · "Enter your PIN" |
| Grant states | "No support access granted" · "When you contact Vento, you can give support time-limited, read-only access here. You can revoke it at any time." · **Give access** · toast "Support can view Kora Victoria Island until 28 Nov, 10:21" · **Revoke now** · toast "Support access revoked" |
| What support did | "Signed in with the access you granted" · "Opened Rooms · Kora Victoria Island" · "Left the support view" · "Mrs Adaeze Okafor granted read-only access for 3 days" |
| Open view | "Open a read-only view of Kora Hotels Group?" · "Mrs Okafor sees every page you open." · **Open read-only view** |
| Banner | "Support view · Kora Hotels Group · read only · ends 28 Nov, 10:21" · **Leave** · disabled tooltip "Read-only support view" |
| View ended | "Support view ended. Mrs Okafor revoked access at 11:02." / "…Access ended at 10:21." / "…Your console session timed out." |
| Owner email | Subject "Vento support is looking at Kora Hotels Group" · "Seyi from Vento support opened a read-only view of Kora Victoria Island at 10:24. Reason: Help with the room import. Access ends 28 Nov, 10:21." · **Revoke access** |
| Team | "Vento team" · **Invite** · "Invite Tunde to the Vento console?" · **Send invitation** · "Remove Seyi Bankole from the Vento team?" · "Their account closes and they're signed out everywhere. Their name stays on past activity." · **Remove Seyi** |
| Command refused | "Make this change in the Vento console. If the console is down, add --break-glass." |
| Offline | "You're offline. The Vento console needs a connection." |

## Out of scope
- **Read and fix** support access, impersonation, or any write in a support view (decision 2 below).
- Subscription billing, plans, prices, invoices and payment state (Stage 6); the plan and invoices half of design #46 stays hidden until then.
- Releases with stages, plan versions, limits, AI usage and add-ons, the customer-activity Dashboard and passkeys (in Vento Real Estate's console, not needed here).
- Editing customer data from the console (members, hotels, two-step resets for hotel staff): owners do that in their workspace.
- Per-property feature switches, scheduled switches, bulk changes, a second approver, staff roles below one "Vento staff", exporting the platform trail, a help desk or ticket system.
- Trial reminder emails (owners see the trial on Home and Account), and anything that locks a group when a trial ends.

## Changes to docs
- **`docs/DOMAIN.md`:**
  - Devices and sign-in table, add: **Vento console** ("The Vento team's staff-only area at `/console`: groups, feature switches, trials, failed jobs, support views and the platform activity trail. | Its own shell; not found for anyone else. Opens with a fresh authenticator code; closes after 15 minutes idle or 8 hours."); **Vento staff** ("A Vento team member with a staff account. | Never a member of a group. Two-step required and can't be turned off. Joins by a 48-hour staff invitation."); **Trial** ("A group's free period, with start and end dates. | Until billing (Stage 6) only a label and a reminder to owners; nothing stops at the end."); **Support access** ("An owner's consent for Vento support to view the group read-only, for 1 hour, 24 hours or 3 days, at chosen hotels. | Granted with the owner's PIN, revocable at any time, one at a time."); **Support view** ("A Vento staff member's read-only look at a group under support access. | Banner on every page; every write refused (`SUPPORT_READ_ONLY`); ID numbers masked with no reveal; no downloads or exports; every page opened is listed for the owner."); **Platform activity** ("Append-only trail of every Vento team action. | Who, channel (console, command line, scheduled), group, before → after, reason."); **Break-glass change** ("A switch made from the command line because the console is down. | Needs `--break-glass`; every other staff member is emailed.").
  - Feature switch notes: "Set by the Vento team in the Vento console (decision 0027), never the hotel."
  - Permissions matrix: new row **Give or revoke Vento support access** · owner only.
  - Devices and sign-in rule: two-step "optional" becomes "optional for hotel staff, required for Vento staff".
- **`docs/journeys/going-live.md`:** step 1a "with `pnpm features on`" → "in the Vento console"; step 2 → "Give access", Read only, 3 days, Kora Victoria Island, PIN; toast "Support can view Kora Victoria Island until 15 Nov 2026, 10:21"; "every support action is an audit event naming the specialist" → "every view and page support opens is listed in What support did"; step 3 "with the specialist on a call" → the specialist watches through a read-only support view while Tunde types; the longest grant is now 3 days, not 7, so Mrs Okafor gives access again on Mon 16 Nov for the parallel run and step 14 day 3 "extends it by 3 days" → "gives access again for 3 days"; "Support access expires mid-task" → "the support view ends; nothing was changed, because support can't change anything". Name the specialist Seyi Bankole.
- **New `docs/journeys/vento-console.md`:** flows A–F above, with "Becomes tests" (`apps/web/e2e/console/*.spec.ts`; API walk tests `console-access.test.ts`, `support-read-only.test.ts`).
- **`docs/design/screen-inventory.md`:** Vento console row notes: "Groups, group detail with features and trial, failed jobs, activity, Vento team; support view read-only". Support access row: "Read only; Read and fix hidden".
- **`docs/design/CHANGES.md`:** #46 support: "Read and fix" hidden; "Ticket" → "Reason" (decision 7 below); "Adaeze from Vento support" → "Seyi from Vento support"; plan and invoices view hidden until Stage 6.
- **`docs/PRODUCT.md`:** release plan Stage 1 adds "Vento console (groups, switches, trials, failed jobs, read-only support)"; Stage 6 keeps subscription billing and drops "support console".
- **`docs/specs/stage-1-plan.md`:** add row 5b; **`docs/specs/stage-0-feature-switches.md`** Out of scope: "A support console screen for switches (Stage 6)" → built in brick 5b.
- **Decisions:** new 0027 (above). 0021's "Who switches … `pnpm features` … A support console screen can come later (Stage 6)" is superseded; 0023 is amended for staff.
- **`docs/ARCHITECTURE.md`:** the console router chain, contract subpath, platform tables and the read/write declaration on customer procedures.

## Decisions (owner, 2026-11-27)
1. **Separate staff accounts.** Staff join only by a staff invitation, belong to no hotel group and land on the console.
2. **Support is read only.** "Read and fix" is hidden and comes later behind its own security review.
3. **`pnpm features` switching is emergency use only:** `--break-glass` plus the staff email, and every other staff member is emailed at once. Listing stays open.
4. **Trials start automatically at sign-up, for 30 days**; Vento can change the end date.
5. **Nothing stops when a trial ends** before billing exists: owners see "Your trial ended" on Home and Account, and Vento follows up by hand.
6. **Owners only** give or revoke support access, with their PIN.
7. **A short reason, not a ticket number**, when giving access.
8. **The hotel sees the staff member's first name** ("Seyi from Vento support").

## Open questions
None.
