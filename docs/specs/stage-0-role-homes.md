# Role-shaped Home and All hotels

- **Status:** built (brick 15)
- **Stage:** 0 (the shape); the figures fill in as each module ships from Stage 1
- **Module:** Platform
- **Walkthroughs:** `owner-morning.md` (step 7: group home, then one hotel), `front-desk-morning.md`, `room-attendant-shift.md`
- **Screens:** Group executive home (#1, `ExecHome.dc.html`), Property GM home (#2, `GMHome.dc.html`); hotel switch in the top bar (Shell components)

## Problem
One Home for everyone talks to no one. A front desk agent wants today's arrivals; a room attendant wants their rooms; an owner wants the whole group and then one hotel. People who see every hotel also need to switch between the group and a single hotel without hunting.

## Persona and job
- **Owner, group admin, group finance, viewer** (daily): see the group at a glance, open one hotel's day, come back.
- **GM, front desk, housekeeping, restaurant, maintenance, stores, sales, revenue, HR** (every shift): land on their hotel with the figures and first actions of their job.

## User flow
1. Adaeze (owner) signs in. The hotel switch says **Group · All hotels**; Home shows "Across the group", every hotel as a row and "Needs attention" across the group.
2. She clicks **Kora Ikeja GRA**. Home becomes that hotel's day ("Today at Kora Ikeja GRA") and the switch shows the hotel.
3. **All hotels** in the banner (or in the switch) takes her back. The choice is remembered on this browser.
4. Chiamaka (front desk, Victoria Island only) signs in and lands on "Today at Kora Victoria Island" with **New reservation**, **Walk-in** and **Tape chart**. She has no All hotels choice.

## Acceptance criteria

### Main path
- "All hotels" appears in the hotel switch only for members who see every hotel, whose role spans the group (owner, group admin, finance, viewer), with more than one hotel, signed in with a password. It is their default.
- Group view: four group figures by role (owner and admins: occupancy, ADR, RevPAR, revenue this month; finance: revenue this month, city ledger outstanding, cash variances, exceptions), every hotel as a row (business date, people, shared devices) that opens that hotel's Home, Needs attention across the group, the setup checklist and Your workspace.
- Hotel view: the role's job and hotel in the banner with its quick actions; four figures for the role; the hotel (business date, check-in and check-out, people, shared devices); Needs attention for that hotel; setup checklist; Your workspace.
- A figure whose module hasn't shipped keeps its tile and says "Arrives with <module>"; it never shows a dash or a zero that could pass for data. Its tile opens the module page.
- Quick actions show only modules the role uses and the group has switched on.
- Needs attention (Stage 0): business date behind the calendar; for people who manage setup, hotels with no shared devices, invites not accepted, and "Just you so far". Nothing to show reads "All clear".

### Organization isolation
- Per-hotel counts come from `organization.home`, scoped to the member's group from the session.

### Property scoping
- `organization.home` returns rows only for hotels the member can access. A front desk agent sees one row.

### Permissions, limits and approvals
- Counts of people and devices per hotel are visible to every role; names and settings stay behind `setup.manage`. Setup prompts in Needs attention need `setup.manage` and are hidden while previewing a role.
- Previewing a role that works in one hotel shows that hotel, never All hotels.

### Audit events
- Not relevant: Home and the hotel switch change nothing.

### Leakage exceptions, offline behaviour, business date, tax lines, foreign currency, availability locking
- Business date: each hotel's own, flagged when behind the calendar. The rest: not relevant until the modules that feed the figures ship.

### Empty, error and edge cases
- No hotel access: "You're not on a hotel yet. An owner can give you access from Settings."
- Hotels fail to load: an alert to check the connection and refresh.
- A remembered hotel that's gone or no longer accessible falls back to the first hotel.
- On a shared device, Home is always that device's hotel.

## Behind the scenes
- `organization.home` adds `byHotel: { propertyId, people, devices }[]`. People counts group-wide members plus those assigned to the hotel.
- The choice is stored in `localStorage` (`vento.propertyId`, `all` for All hotels; `vento.lastPropertyId` for pages that need one hotel). It's saved only when someone chooses, so a preview never overwrites it.
- What each role leads with lives in `apps/web/src/components/home/role-focus.ts`.

## Out of scope
- Real figures, arrivals lists, house status, VIPs, staff on duty, period switch (Today, MTD, YTD), board pack: they come with their modules.
- Per-person Home customisation.
