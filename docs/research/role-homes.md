# Role homes: research

Research for the role-shaped Home (Stage 0 shell today, real figures as each module ships, final pass near the end of the release plan). It builds on the approved designs `docs/design/export/GMHome.dc.html` and `ExecHome.dc.html`, the journeys in `docs/journeys/`, and the current `apps/web/src/components/home/role-focus.ts`. Written 26 Nov 2026. Vendor sources are mostly help centres and marketing pages, so treat feature claims as vendor-stated.

## 1. Principles

1. **One question per Home.** Each role's Home answers one question ("Is every arrival going into a ready room?"). Stephen Few defines a dashboard as what one person needs for their objectives, on one screen, taken in at a glance ([Few, *Why Most Dashboards Fail*](https://blogs.ischool.berkeley.edu/i247s13/files/2013/02/WhyMostDashboardsFail.pdf)). Why: a Home that tries to serve everyone ends up serving nobody.
2. **"Needs you now" comes before the figures, or sits right next to them.** Linear's Focus grouping puts urgent work first ([Linear, My Issues](https://linear.app/docs/my-issues)), and its Priority inbox separates what needs action from what can wait ([Linear changelog](https://linear.app/changelog/2026-09-03-priority-inbox)). Why: staff open Home to act, not to admire.
3. **Every figure has a comparison.** Show it against yesterday, the budget, last year or the target. Atomize leads with month-to-date RevPAR against the same time last year ([Atomize overview](https://help.mews.com/s/article/Overview-dashboard-in-Atomize)), and ExecHome already shows "+3.1 pts vs budget". Why: a figure with nothing to compare against can't tell you whether things are good or bad.
4. **Big, top-left, few.** Tableau's eye-tracking study found readers start top-left and that big numbers pull attention ([Tableau](https://tableau.com/sites/default/files/whitepapers/core_eye-tracking_whitepaper_update.pdf)). Put one or two hero figures there and three to five supporting ones after them. Why: the reader takes in the hierarchy before reading anything.
5. **Use colour only for exceptions.** NN/g notes that one red dot stands out among blue ones, and that length and position read more accurately than area or angle ([NN/g](https://www.nngroup.com/articles/dashboards-preattentive/)). Prefer bars and progress lines to pies and gauges. Why: if everything is coloured, nothing stands out.
6. **Every figure opens the list behind it.** OPERA Cloud tiles open the matching search, such as Block opening Manage Blocks ([OPERA Cloud tiles](https://docs.oracle.com/en/industries/hospitality/opera-cloud/24.4/ocsuh/t_managing_dashboard_tiles.htm)). Why: a number you can't open becomes a phone call to someone else.
7. **Show progress through the day, not just totals.** "38 arrivals · 12 checked in · 26 to come" (GMHome), or Mews's count of what remains and what was missed ([Mews dashboard](https://help.mews.com/s/article/your-dashboard)). Why: operational roles care about what's left.
8. **Be honest about time and freshness.** Label every figure with its basis: business date or live, "as of 17:50", or "last synced 4 min ago, 3 changes waiting". Stripe labels its home charts as estimates ([Stripe](https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights)). Why: during a power or internet cut a stale number that looks live is worse than no number.
9. **Phone-first for floor staff, desk-first for managers.** Attendants, waiters and maintenance use shared mid-range Android phones and tablets. Give them one column, 48px targets, the next task at thumb height and no charts. Why: their Home is a work queue, not a report.
10. **Leakage shows on every manager's Home.** Each manager sees yesterday's discounts, voids, refunds, cash variances and room discrepancies, with names and approvers. Nigerian commentary names untracked discounts and mismatches across shifts as the daily leaks, and late reports as the owner's blind spot ([Trust Radio](https://trustradio.com.ng/en/how-nigerian-hotels-are-losing-revenue-daily-and-the-technology-fixing-it)). Why: this is the reason owners buy.
11. **Role sets the Home; permissions set what's on it.** OPERA shows a tile only when the role has the task behind it ([OPERA Cloud dashboard](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.1/ocsuh/c_home_dashboard.htm)). Why: a tile that leads to "no access" breaks trust. The server still enforces access.
12. **Lightweight and cache-first.** Load from one summary endpoint per Home, keep the last good copy in IndexedDB, and render under 1 s on weak 3G (UX-STANDARD §1). Why: Home is the first thing loaded after a power cut.

## 2. Per role

Stage numbers follow the release plan in `docs/PRODUCT.md`: 1 front office, 2 housekeeping and maintenance, 3 restaurant and bar, 4 distribution and guests, 5 back office, 6 group and analytics.

### Owner, group admin, viewer: the group (ExecHome)
- **Question:** "How did my hotels do, and is anyone stealing or slipping?"
- **Hero:** group occupancy tonight with its change against budget, and revenue month-to-date against budget (stage 1, budgets stage 6).
- **Supporting:** ADR and RevPAR (today and month-to-date, against last year), cash collected yesterday against revenue (1), city ledger over 60 days (5), and later GOPPAR. GOPPAR tracks hotel value better than RevPAR and matters more where F&B is a large share of revenue ([Mews on GOPPAR](https://mews.com/en/blog/goppar), [UCF study](https://stars.library.ucf.edu/rosenscholar/521)). It needs the stage 5 ledger, and diesel per occupied room (2) is a Nigerian cost line that feeds it.
- **Needs you now:** properties below forecast; yesterday's exceptions by type, with naira totals; unbalanced cashier shifts; corporates over their credit limit; licences expiring; approvals waiting on the owner.
- **Quick actions:** Open the leakage report, Board pack, Message GM, Switch hotel.
- **Form:** headline figure tiles, then a property table with a sparkline per row, a pace bar pair (this year against last year), and an exceptions strip. **Phone:** the owner reads it on Android before WhatsApp. Stack the tiles, turn the table into cards and keep exceptions at the top (see `owner-morning.md`).
- **Group admin:** has the same figures, but leads with setup health: invites pending, devices offline or not synced, hotels with incomplete setup, feature switches. A viewer sees everything read-only, with no actions.

### General manager: one hotel today (GMHome)
- **Question:** "Will today go smoothly, and is the money right?"
- **Hero:** arrivals, departures and in-house as progress figures (1), and revenue today against budget (1).
- **Supporting:** occupancy tonight against budget, rooms ready to sell tonight, house status bar (2), staff on duty against the roster (5), and F&B revenue today (3).
- **Needs you now:** arrivals without a room; early arrivals whose room isn't ready; departures with a balance due; urgent work orders; room discrepancies (2); approvals waiting on the GM PIN; VIP requests.
- **Form:** as GMHome: figure tiles, an arrivals table, the needs-attention list, a stacked house-status bar, and lists of VIPs and staff.

### Revenue manager
- **Question:** "Am I priced right for the next 30 to 90 days?"
- **Hero:** on-the-books occupancy for the next 30 days, against last year at the same point. In the first year there's no history, so compare against budget or forecast ([Smartness on pace](https://www.smartness.com/en/blog/hotel-booking-pace) warns about odd base years).
- **Supporting:** pickup for yesterday, the last 7 days and the last 30 days, in room nights and revenue (1, the Atomize pattern); ADR and RevPAR month-to-date against last year (1); OTA share and commission (4); cancellations in the last 7 days (1).
- **Needs you now:** dates with low pace; dates nearly sold out that still have open low rates; channel push failures and rate parity breaks (4); group blocks reaching their release date.
- **Actions:** Rates and restrictions, Pace report, New reservation.
- **Form:** a 30-day calendar heat strip with each cell showing occupancy and pace against last year, and a pickup bar chart. Pickup is the net change over a short window, and pace compares against a benchmark at the same point in time ([Lighthouse](https://mylighthouse.com/resources/blog/booking-pickup-and-pace-revenue-management)). Show both, labelled clearly.

### Front desk, including night audit
- **Question:** "Is every arrival going into a ready room, and is every departure settled?"
- **Hero:** arrivals left and departures left, with progress (1).
- **Supporting:** rooms ready against arrivals still to come (2), in-house tonight, balance due on today's departures, and drawer status (open or closed, with no expected total).
- **Needs you now:** arrivals without a room; arrivals whose room isn't ready, with how long until they arrive; guests with an ID still to capture (NDPA, foreign nationals); deposits not received; work orders on occupied rooms; the guest request queue. On the night shift, the night audit checklist (open bills, unsettled folios, outlets not closed).
- **Actions:** Walk-in, New reservation, Check in next, Tape chart, Take payment.
- **Form:** an arrivals list sorted by ETA with a room-readiness chip on each row. Mews's suggested routine has the morning shift review arrivals for notes and room allocation, and the night shift confirm inspected rooms for arrivals still to come ([Mews checklist](https://help.mews.com/s/article/what-is-the-suggested-operations-checklist)). OPERA's "60 minutes activity" tile, showing check-ins, check-outs and rooms cleaned in the last hour, makes a good pulse line.

### Sales
- **Question:** "Am I on track for this month's room nights, and which accounts need a call?"
- **Hero:** corporate and group room nights this month against target (4).
- **Supporting:** room nights picked up from corporates in the last 7 days; quotes awaiting reply and their value; the next three events; city ledger balance by top account (5).
- **Needs you now:** quotes expiring; accounts over their credit limit; accounts with no booking in 60 days; group blocks with unpicked rooms before their cutoff.
- **Form:** a progress ring against target, a list of accounts with a sparkline each, and a timeline of events.

### F&B manager
- **Question:** "Is service running clean tonight?"
- **Hero:** F&B revenue today against the same weekday last week (3).
- **Supporting:** covers, average spend, open bills (and any past closing), kitchen ticket times, and voids and comps today with their naira values.
- **Needs you now:** voids after a ticket was sent; reprinted bills; bills open past closing; approvals waiting on the PIN; stock items running low for the menu (5).
- **Form:** outlet cards, each with a live revenue line, and an exceptions list. Lightspeed Pulse shows live revenue, covers and open orders with comparisons across periods, switchable by venue ([Lightspeed Pulse](https://www.lightspeedhq.com/pos/restaurant/lightspeed-pulse/)).

### Cashier
- **Question:** "What do I still have to do before my shift closes?"
- **Hero:** open bills to settle, and the shift status ("Shift open since 16:00").
- **Supporting:** payments taken by method (cash, POS terminal, transfer, room charge) by count, transfers waiting for confirmation, and bills posted to rooms. **Never** show the expected drawer total: the blind count in DOMAIN depends on the cashier not seeing it.
- **Needs you now:** bills open too long; transfers not matched; outbox items not yet synced.
- **Actions:** Settle a bill, Close shift (blind count).
- **Form:** a short checklist in the spirit of Square's shift report, which can't run until bills are closed and tips adjusted ([Square](https://squareup.com/help/us/en/article/8140-run-a-restaurant-shift-report)), with Toast's per-employee shift review as the close step ([Toast](https://support.toasttab.com/en/article/Shift-Review-Overview)).

### Waiter
- **Question:** "What do my tables need right now?"
- **Hero:** the waiter's own open tables, shown as a table map (3).
- **Supporting:** orders ready at the pass, tables waiting for their bill, and the waiter's own sales this shift.
- **Needs you now:** food ready to serve; table open over 90 minutes; a void waiting for approval.
- **Form:** a floor plan or table grid on a tablet, with this waiter's tables highlighted (Toast marks the checks a server owns with a stripe, per [Toast tables](https://support.toasttab.com/en/article/New-POS-Managing-Tables)). No charts.

### Housekeeping supervisor
- **Question:** "Will rooms be ready in time for arrivals?"
- **Hero:** rooms needed for today's arrivals, split into ready and not ready, and the count of dirty rooms falling through the day (2). ALICE's board count of dirty rooms updates as attendants work ([ALICE rooms tab](https://aliceplatform.atlassian.net/wiki/spaces/ALICEKB/pages/1754202719/Rooms+Tab+-+Web)).
- **Supporting:** inspections due, each attendant's progress, out-of-order rooms, and discrepancies today.
- **Needs you now:** rush rooms for early arrivals; rooms where a sleeper or skipper has been flagged; unassigned rooms; lost and found to log; attendant workloads out of balance.
- **Form:** a room grid by floor, colour-coded by status, beside a list of attendants with progress bars. Optii's supervisor view combines assignments, cleans, workload credits and quick actions such as DND and Rush ([Optii](https://help.optiisolutions.com/managing-your-team-from-the-optii-mobile-app)). Flexkeeping orders cleaning by arrivals and departures ([Flexkeeping](https://flexkeeping.com/solutions/front-office-managers)).

### Room attendant
- **Question:** "Which room next?"
- **Hero:** a ring for rooms done against assigned (for example 3 of 8), and a **Next room** card (room number, departure or stayover, "guest arrives 11:30", Start button).
- **Supporting:** the remaining rooms in priority order, with a rush badge on any room an arrival is waiting for.
- **Needs you now:** a rush room; a supervisor's note; a room returned after a failed inspection.
- **Form:** a single column with 48px targets. It works offline, with a count of changes waiting to sync. See `room-attendant-shift.md`.

### Maintenance
- **Question:** "What's broken that is costing us a room or a guest?"
- **Hero:** urgent work orders, with how long each has been open, and rooms out of order (2).
- **Supporting:** open work orders against yesterday, work orders completed today, preventive maintenance due this week, generator hours and diesel level (2, a power and diesel log specific to Nigeria).
- **Needs you now:** work orders on occupied or arriving rooms; preventive tasks overdue; diesel below its reorder level.
- **Form:** a list sorted by urgency on a phone. Quore's mobile work orders and preventive templates are the reference ([Quore engineering](https://www.quore.com/engineering)).

### Storekeeper
- **Question:** "What must I issue, receive or reorder today?"
- **Hero:** requisitions to issue and deliveries due today (5).
- **Supporting:** items below their reorder level, stock count variance from the last count, and stock value against last month (keep it small; it's a monthly figure).
- **Needs you now:** urgent requisitions from the kitchen or bar; deliveries short against their purchase order; counts due.
- **Form:** a task list, plus a short list of items below reorder level.

### Finance
- **Question:** "Did yesterday close cleanly, and is the cash where it should be?"
- **Hero:** night audit status for each hotel, and cash collected yesterday against revenue (1).
- **Supporting:** unbalanced cashier shifts with their variance (1), unmatched POS and transfer payments by age (1), city ledger ageing (5), and VAT and consumption tax due this month (5).
- **Needs you now:** variances with no reason entered; payments unmatched for more than 2 days; corporates over their credit limit; statements to send.
- **Form:** an inbox in Ramp's style, where the Inbox shows a count of items needing you and gathers every approval in one place ([Ramp](https://support.ramp.com/hc/en-us/articles/4417421399699-Reviewing-transactions-from-Ramp-cards)), next to an ageing bar and a balance per entity (as in ExecHome).

### HR
- **Question:** "Is every shift staffed, and is payroll on time?"
- **Hero:** the next payroll date with a countdown and its status (5). Gusto shows payroll deadlines and missed payrolls on its home under its important tasks ([Gusto](https://support.gusto.com/article/178361225624246/notifications-center)).
- **Supporting:** staff on duty against the roster, absences today, leave requests, and contracts ending within 30 days.
- **Needs you now:** unfilled shifts; leave waiting for approval; staff missing bank or pension details before payroll.
- **Form:** a to-do list with a payroll countdown card.

## 3. Patterns worth borrowing

- **Circular summary widgets that flag the items needing action:** [Mews dashboard](https://help.mews.com/s/article/your-dashboard).
- **A "60 minutes activity" pulse tile, and tiles gated by role:** [OPERA Cloud](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.1/ocsuh/c_home_dashboard.htm).
- **A 14-day outlook for occupancy and revenue on the front desk home, and in-house counted by rooms or by guests:** [Cloudbeds](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/115000400634). A user complaint that the redesign merged stayovers into in-house counts is a warning for us ([Cloudbeds new dashboard](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/16873372577435-Get-to-know-your-new-Dashboard)).
- **Pickup over yesterday, 3, 7 and 30 days, and month-to-date against last year:** [Atomize](https://help.mews.com/s/article/Overview-dashboard-in-Atomize).
- **Dirty count that falls as attendants work:** [ALICE](https://aliceplatform.atlassian.net/wiki/spaces/ALICEKB/pages/1754202719/Rooms+Tab+-+Web).
- **Sending people who have a dashboard to it first on login, and an attendant view showing the room each person is cleaning now:** [Optii](https://help.optiisolutions.com/managing-your-team-from-the-optii-mobile-app).
- **A shift checklist that blocks close until open items are done:** [Square](https://squareup.com/help/us/en/article/8140-run-a-restaurant-shift-report) and [Toast](https://support.toasttab.com/en/article/Shift-Review-Overview).
- **Live revenue, covers and open orders, with switchable comparisons and venues:** [Lightspeed Pulse](https://www.lightspeedhq.com/pos/restaurant/lightspeed-pulse/).
- **One inbox with a count, and a "requires your approval" block on the home page:** [Ramp](https://support.ramp.com/hc/en-us/articles/31702539953171-Vendor-Approvals).
- **A to-do list on the company home page:** [Gusto](https://gusto.com/partner-resources/quarterly-scoop-may-2022-recruiting-to-do-lists-exciting-integrations).
- **Balance and money in and out as the hero, shown on phone widgets too:** [Mercury](https://mercury.com/blog/may-2025-product-updates).
- **A date range and comparison picker on the home page, with figures labelled as estimates:** [Stripe](https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights).
- **A Focus ordering (urgent first, then SLA-bound):** [Linear](https://linear.app/docs/my-issues).

## 4. Anti-patterns

- **Vanity counts.** "Corporate accounts: 48" or "Stock value" as a daily hero changes nothing anyone does today.
- **Figures without a basis.** Mixing tonight, the business date and month-to-date on one row without labels. ExecHome's "Today / MTD / YTD" switch is the fix.
- **Gauges, pies and 3D.** Area and angle read poorly ([NN/g](https://www.nngroup.com/articles/dashboards-preattentive/)). Use one ring at most, for a single person's progress.
- **Red everywhere.** Few keeps his examples mostly grey and saves colour for the item that needs attention.
- **Customisable widget walls at launch.** Users end up with empty or cluttered homes. Ship opinionated homes per role first. OPERA needs a separate permission to edit the dashboard.
- **Showing the cashier the expected cash.** It breaks the blind count.
- **Spinners on Home when offline.** Show the cached copy with its time instead.
- **Charts on floor phones.** Attendants and waiters need the next task, not a trend line.
- **Last-year comparisons with no last year.** New customers have no history, so fall back to budget, forecast or last week, and say so.
- **Naming people in exceptions without context.** Always show the reason and the approver ("Each one has a reason and approver on record").

## 5. Gaps against the current `role-focus.ts`

- **owner / group_admin** reuse `HOTEL_LEAD` (the GM figures). The owner's Home should be group-first even with one hotel: occupancy, revenue against budget, cash collected and exceptions yesterday. `group_admin` should lead with setup health (invites, devices, hotels set up).
- **`groupFigures`** has no comparisons and no leakage. Add "Exceptions yesterday" and "Cash collected yesterday", and label "Revenue this month" as "vs budget".
- **general_manager:** the figures are right. Add progress subtext ("12 checked in · 26 to come") and a needs-attention list. Rename "In house" to "In house tonight" and show occupancy %.
- **revenue_manager:** label ADR and RevPAR "month to date". Replace "Occupancy tonight" with "On the books, next 30 days" and add "Pace vs last year (or budget)". "Pick-up, last 7 days" is good and should come from `/reservations` or `/analytics`.
- **front_desk:** change "Rooms ready" to "Arrivals waiting on a room". Add "Balance due on departures". Add Check in and Take payment to the actions.
- **sales:** change "Corporate accounts" (a count) to "Accounts over credit limit". Change "Quotes open" to "Quotes awaiting reply". Rename "Room nights this month" to "Room nights vs target". Rename "Groups on the books" to "Group room nights, next 90 days".
- **fnb_manager:** add "Bills open past closing". Rename "Voids today" to "Voids and comps today (₦)". Add a "Covers vs last week" comparison.
- **cashier:** remove **"Cash in the drawer"**, which conflicts with the blind count in `docs/DOMAIN.md`. Replace it with "Transfers to confirm". Add a "Close shift" action.
- **waiter:** replace "Bills posted to rooms" and "Covers today" with "Food ready to serve" and "Tables waiting for the bill". Home should *be* the table map.
- **housekeeping_supervisor:** add "Rooms needed for arrivals" and "Discrepancies today". Add an Inspect action.
- **room_attendant:** replace "Minibar items to post" with a "Next room" card. Make "Rooms done" a ring against "Rooms assigned".
- **maintenance:** "Urgent" uses the `CalendarClock` icon; use an alert icon instead. Add "Preventive maintenance due" and "Diesel / generator hours".
- **storekeeper:** move "Stock value" down. Add "Count variance" or "Counts due".
- **finance:** "Revenue today" is the wrong basis for finance. Use "Night audit" status and "Revenue yesterday (closed)". Add "Payments unmatched".
- **hr:** add "Unfilled shifts today". Make "Next payroll" a date with a countdown.
- **Everyone:** add a needs-attention slot to the `RoleFocus` type, a comparison on each `Figure` (`vs: 'yesterday' | 'budget' | 'lastYear' | 'target'`) and a basis (`live | businessDate | mtd`), so the tiles can't ship without them.

## 6. Build order

1. **Stage 1:** add `needs` (the needs-attention list), `vs` and `basis` to `RoleFocus`. Ship a single home-summary endpoint per role with an IndexedDB cache and an "as of" stamp. Make the front desk and GM homes real, and add the owner's exceptions strip, sharing data with the owner's daily report.
2. **Stage 2:** the housekeeping supervisor room grid, the attendant's Next room card, maintenance urgency and diesel, and discrepancies on the GM home.
3. **Stage 3:** the waiter table map, the cashier checklist (blind-count safe), and live F&B outlet cards.
4. **Stage 4:** the revenue pace strip and pickup, sales targets and quotes.
5. **Stage 5:** finance inbox and ageing, storekeeper, HR payroll countdown.
6. **Stage 6:** ExecHome in full (GOPPAR, board pack, budgets), the group admin setup-health home, and a ui-designer pass across all roles in light, dark, phone and desktop.

*Not covered by sources here:* IDeaS, Duetto, Apaleo, Shiji, Hotelogix, protel, Stayntouch, eZee, Brex, Deel, Rippling, Vercel and Notion homes. The searches found no screen-level documentation for them, so no claims are made about them.
