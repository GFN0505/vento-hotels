---
name: design-system
description: The app's visual language — tokens, colours, typography, spacing, layout shells, component usage, status colours, tape chart, room status tiles, folios, POS touch layouts, states, responsive and accessibility rules. Use when building or reviewing any UI in apps/web.
---

# Design system

The quality bar is Linear, Stripe Dashboard, Mercury and Mews: calm, fast, precise. The approved designs are in `docs/design/export/` (Claude Design export, 25 Nov 2026: all 46 screens with dark, 390px and state variants). They are the source of truth: when this file and the designs disagree, follow the designs and fix this file. `docs/design/export/vento.css` holds the exact token values below. The `.dc.html` files need the Claude Design runtime to render, so read them as reference (layout, copy, values) or view them in Claude Design.

## UX principles (apply to every screen)
1. **One job per screen, one primary action.** The most important number or status is the first thing seen (today's arrivals, the folio balance, rooms left to clean).
2. **≤ 3 clicks** for common tasks (check in, post a charge, take a payment, mark a room clean, send to kitchen). Every action is also in the ⌘K command palette. A walk-in check-in takes under 60 seconds.
3. **Defaults over settings.** Pre-fill from property defaults and the last-used values (e.g. arrival = business date, departure = +1 night, the guest's last room type and rate plan, payment method = last used at this desk).
4. **Progressive disclosure.** Show the essentials, and put advanced fields behind "More options" (routing, foreign national details for Nigerian guests).
5. **Undo over confirm.** Reversible actions run immediately with an undo toast. Confirm only for money movements, voids, comps, cancellations and permanent deletes, and the confirm button says exactly what happens ("Take ₦185,000 by transfer").
6. **Inline over modal.** Edit simple fields in place. Use a side sheet for multi-field edits (reservation, guest), and a stepped sheet for flows (check-in, check-out, night audit).
7. **Speak the user's language.** Domain terms from `docs/DOMAIN.md`, plain English, no jargon or codes. Errors say what to do next.
8. **Keyboard and touch.** Front desk and back office are keyboard-first (`?` shows shortcuts). POS, housekeeping and maintenance are touch-first on phones and tablets: bottom navigation, sticky primary action, large targets.
9. **Feels instant, even offline.** Route preloading on hover, skeletons that match the final layout, optimistic UI for safe toggles, no layout shift. Offline actions apply immediately and show a "Will sync" mark.
10. **Nothing extra.** Remove any element that doesn't help a user decide or act.

## Tokens (defined in `apps/web/src/styles.css`, consumed via Tailwind)
| Purpose | Token / class |
|---|---|
| Brand / primary action | `bg-primary text-primary-foreground` (brand `#7677FB`; primary button `#6364F0`, hover `#5354DE`; soft tint for selected states) |
| Page background | `bg-background` (light `#F5F6F8`, dark `#0A0F1E`); surfaces light `#FFFFFF` / dark `#111729` |
| Text | primary, secondary and tertiary text tokens (light `#101828` / `#475467` / `#667085`) |
| Card / surface | `bg-card text-card-foreground border` |
| Secondary text | `text-muted-foreground` |
| Destructive | `bg-destructive`, `text-destructive` |
| Sidebar | `bg-sidebar text-sidebar-foreground` (dark navy in both themes: light `#0E1630`, dark `#070B17`) |
| Focus ring | `ring-ring` (brand) |
| Room status | `bg-status-clean`, `bg-status-dirty`, `bg-status-occupied`, `bg-status-ooo` (+ `-foreground`, `-muted` tints), defined for both themes |
| Status | emerald, amber, blue, rose and slate each with a tinted background, text and dot token, light and dark (values in `vento.css`: `--em*`, `--am*`, `--bl*`, `--ro*`, `--sl*`) |
| Radius | 8px for controls (`rounded-md`), 10px for cards and tiles (`rounded-lg`), `rounded-full` for badges and avatars |
| Shadow | almost none: 1px shadow on cards in light mode, borders do the work; a larger shadow only for overlays. No shadows in dark mode. |

**Product name:** this is *Vento Hotels*, one of several Vento products. Wherever the product is introduced (sign-in panel, phone header, sidebar, tab title, emails), use the `Logo` lockup with `product` ("Vento | Hotels"), never "Vento" alone.

**Light mode is the default** (owner's decision, 25 Nov 2026): Vento opens light whatever the device setting. Dark mode is opt-in per person (`vento.theme` = `dark` or `system`, set from their profile), applied by the script in `apps/web/index.html` through the `.dark` class. Every screen must still work in dark mode.

The hex values here are for defining tokens in `styles.css` only. Port them from `docs/design/export/vento.css`, light and dark, and keep the two files in step.

**Never** write hex, rgb or arbitrary colour values in components. If a colour is missing, add a token in `styles.css` with a dark-mode value.

## Typography
**Inter** (self-hosted via `@fontsource-variable/inter`, with `cv11` and `ss01` features), chosen in the design over Poppins because it stays readable in dense tables, grids and folios. Base size is **13px / 20px**; the app is dense like Linear and Stripe, not marketing-sized. Scale (from `vento.css`):
- Display 28/36 semibold (stat headlines), page title 22/30 semibold, section title 16/24 semibold, card title 14/20 semibold
- Body 13/20, small 12/16, label 11/16 semibold uppercase with letter spacing (table headers, field labels)
- Secondary text uses the secondary text token, captions the tertiary one
- POS, PIN pad and housekeeping phone screens scale up (body 15–16px) for touch
- Numbers in tables, folios, tiles and stats use `tabular-nums`. Room numbers in tiles `text-base font-semibold`.

## Spacing and layout
- 4px grid. Page padding `p-4 sm:p-6`, gaps between sections `gap-6`, inside cards `p-4 sm:p-6`, form fields `gap-4`.
- App shell: fixed sidebar (`w-64`, collapsible to icons) on `lg+`, Sheet drawer below `lg`, top bar with property switcher (hidden for single-property members), business date, search, notifications, connection status, theme toggle and user menu.
- The **business date** is always visible in the top bar ("Business date 25 Nov 2026") and turns amber when it differs from the calendar date after midnight.
- Max content width `max-w-7xl` for forms and detail pages. Lists, the tape chart and the room board use the full width.
- Forms: one column on mobile, two columns from `md`, using container queries inside dialogs.
- POS and housekeeping use their own full-screen touch shells (no sidebar).

## Components (shadcn only, from `@/components/ui`)
Button (`default`, `secondary`, `outline`, `ghost`, `destructive`; sizes `sm`, `default`, `lg`, `icon`), Input, Select, Combobox (Command + Popover), DatePicker and DateRangePicker (Calendar + Popover), Dialog, Sheet, DropdownMenu, Tabs, Table, Badge, Card, Skeleton, Tooltip, Sonner.
App-level: PageHeader, DataTable, DataTableToolbar, StatusBadge, EmptyState, ConfirmDialog, MoneyInput, EntityCombobox, StatCard, TapeChart, RoomTile, Folio, PosKeypad, OfflineBanner, PinPad, ApprovalPrompt, ExceptionRow.
Don't create a second version of any of these. Extend with `variant`s via `cva`.

## Status colours (StatusBadge, RoomTile)
| Meaning | Colour | Examples |
|---|---|---|
| Ready / done | emerald | `clean`, `inspected`, checked out & settled, paid, `resolved`, `definite` event, received |
| Waiting / attention | amber | `dirty`, `tentative`, deposit due, arriving today not checked in, `pending` assignment, licence expiring, credit limit near |
| In use / in progress | blue | `occupied`, `checked_in`, `in_progress`, check `sent`, `assigned` |
| Problem / blocked | rose | `out_of_order`, `no_show`, `cancelled`, overdue city ledger, blacklisted, void, cash variance, `sleeper` / `skipper` discrepancy, unmatched payment |
| Neutral | slate | `vacant` (no other status), `out_of_service`, `draft`, `closed`, archived |
`inspected` and `clean` share emerald; `inspected` adds a check icon. A badge is a dot plus a label on a tinted background. Never rely on colour alone.

## Hotel patterns
- **Tape chart:** rooms as rows (grouped by room type, then floor), dates as columns (default 14 days, up to 30) starting at the business date; today's column highlighted. Each stay is a bar from arrival to departure with guest name, nights and a status colour (`confirmed` brand, `checked_in` blue, `tentative` amber; unassigned stays in a strip at the top of each room type). OOO periods are rose hatched blocks. Drag to move or extend (with a confirm that shows the rate change), click opens the reservation sheet. Sticky room column and date header; availability count per room type per date in the header row. Keyboard: arrows move the focus cell, Enter opens. Below `md`, switch to a one-day list by room type.
- **Room status tile (room board):** one tile per room, grouped by floor, showing room number, room type, housekeeping status (colour + label), front office status (`vacant` / `occupied` icon), guest name or "Arriving 14:00", and flags (VIP, do not disturb, late check-out). Tile min 88×88px. Tap opens actions (mark clean, inspect, report issue). Legend with counts at the top ("12 dirty · 31 clean · 4 OOO").
- **Folio:** header with guest, room, stay dates and balance (large, `tabular-nums`, rose if owed, emerald when settled). Postings in business-date order: date, description, department, amount, with tax lines (VAT, consumption tax, service charge) expandable under each charge. Voids show struck through with the reversing line, reason and user beneath. Payments are visually distinct (indented, `text-muted-foreground` label "Payment · Transfer · Ref 2026112512"). Multiple folios as tabs (Guest, Company). Sticky footer: Post charge, Take payment, Settle.
- **POS:** menu grid of category tabs and item buttons, check on the right (bottom sheet on phones). **Every touch target ≥ 48px** (item buttons ≥ 72px tall), 8px minimum gap, no hover-only affordances. Keypad for quantities and amounts. Primary actions (Send, Pay, Post to room) fixed at the bottom. Offline status always visible.
- **PIN pad (shared devices):** full-screen on POS and housekeeping shells: staff avatars or names for the device's property (most recent first), then a 3×4 keypad with keys ≥ 64px, dots for entered digits (never the digits), works offline on a registered device. Wrong PIN shakes the dots (respecting reduced motion) and clears; lockout shows when it ends. After sign-in, the top bar shows "Signed in as Blessing · Sign out", and an inactivity timer signs out with a 10-second warning. Large, one-handed, no keyboard needed.
- **Approval prompt:** a Sheet (bottom sheet on phones) that opens when an action is over the member's limit. States the action, amount and limit plainly ("Discount of 15% is over your 10% limit"), shows the reason already entered, and lets an approver with a higher limit pick their name and enter their PIN (or password on a personal device) right there. Primary button repeats the action ("Approve 15% discount"). The current member can't select themselves. Cancel leaves the record unchanged.
- **Exception row:** used in the exceptions list, the discrepancy report and the owner's daily report. One row per exception: type badge (rose or amber), what happened in one line ("Room 214 found vacant, shown occupied"), staff name, time and business date, amount (`tabular-nums`) where relevant, reason if given, and one action (Resolve with a reason, or View). Resolved rows go muted with who resolved them and why. Never red-highlight a person's name; the facts carry it.
- **Blind count:** the shift-close form shows denomination or total fields only; the expected total and variance appear after "Submit count", not before.
- **Money with currency:** `₦125,000.00`, `$85.00`. Foreign amounts show the NGN equivalent and FX rate in muted text (`≈ ₦131,750 at ₦1,550/$, CBN`). Compact form in stat cards (`₦12.5M`). Right-aligned, `tabular-nums`. Show whether a rate is tax-inclusive.
- **Dates:** `25 Nov 2026`; stays as `25–28 Nov 2026 · 3 nights`. Times in the property's time zone. Relative time for arrivals and ageing ("arriving in 2 hours", "45 days overdue").
- **Room and property photos:** lazy-loaded, `srcset`, with a meaningful `alt` ("Deluxe King room with city view").

## States
Every data view needs loading (skeleton), empty (illustration + action), filtered-empty (clear filters), error (message + retry), offline (cached data + "Last updated 14:32" + pending-sync count), and long content (truncate with a tooltip, or wrap).

## Accessibility (WCAG 2.2 AA)
- Text contrast ≥ 4.5:1 (≥ 3:1 for large text and UI parts), checked in both themes, including text on status-coloured tiles.
- Visible focus on everything interactive. Full keyboard use (tape chart included), and focus is trapped in dialogs.
- Labels on every input. `aria-label` on icon-only buttons and tiles ("Room 204, dirty, vacant"). Errors linked with `aria-describedby`.
- Touch targets ≥ 44px on mobile, ≥ 48px on POS and housekeeping screens. Respect `prefers-reduced-motion`.

## Responsive
Design mobile-first. Test at 375px, 768px and 1280px (POS also at tablet landscape 1024px). No horizontal page scroll (the tape chart scrolls inside its own container). Tables hide secondary columns or switch to cards below `md`. Works in dark mode everywhere.
