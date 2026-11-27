# Polish backlog

Polish-level review findings, batched for one "polish pass" brick near the end of the release plan (owner's lean working style, 2026-11-26). Must and should findings are fixed in their own brick; only polish waits here. Add to it from every review; remove items when done.

## Rate plans and rates (brick 2)
- Change dates sheet: day chips need a clear selected state (check icon, aria-pressed); helper text names the following plans ("Bed & breakfast and Non-refundable change with it").
- Keep / On / Off segmented controls: stronger selected style.
- Toolbar "Business date" button disabled state: style as a disabled ghost button in light and dark.
- Calendar column width ~80px so 14 nights fit at 1440px without horizontal scroll.
- Calendar toast: one line; move the "follow automatically" note to the detail line.
- Plans list at 1024px: Cancellation column width or shorter text.
- Cell aria-labels: add "business date" for today and "price set for this date" for the dot.
- Pick a hotel under All hotels: show plan count or "from ₦95,000" per hotel.
- Tab transitions: skeleton instead of a stale frame for ~1s.
- Code-review minors: undo message names the last actor of any plan event (should be the dates' last editor); percentage message says 1–100% but accepts 0.01; no ₦100,000,000 cap on derived prices; secondary rates queries filter by plan ids only (add organizationId); advisory lock taken before the scope check in create/createFirst/reorder; plan-writes.ts header comment lock order; Number.parseInt on money strings in plan-form-model.ts and preview-model.ts (use dec().toFixed(0)); seed rate dates fixed at Dec 2026.

## Taxes, service charge, payment methods and FX rates (brick 3)
- FX rates: each currency's 30-day line is a small inline SVG, not Recharts as the spec says (kept inside the speed budget; recorded in `docs/design/CHANGES.md`). Revisit if the polish pass adds axes or hover values.
- FX rates are stored and entered with up to 4 decimals, but the history and cards show them through the naira formatter at 2 decimals in places (e.g. the check and replace messages); show the full rate wherever a rate (not an amount) is shown.
- `taxes.set_up` audit event carries `liveProperty` and `exception` but not `liveHotelIds` (the per-tax `tax.created` events do); add it so the owner's daily report can place it without reading the batch.
- The owners' email when a live hotel's guest transfer account changes is sent after commit through the queued email provider, not as its own idempotent pg-boss job (`notify.transfer_account_changed`, keyed by the audit event id) as the spec says. A crash between commit and queueing loses the email (the change is still audited and in the morning report).

## Earlier bricks
- Hotel switch: the native hotel select can't show options in screenshot tools (consider a custom listbox in the polish pass).
- Rate plan Change history: before → after details show only for members with audit.view; add before/after to ratePlans.history so revenue managers see them too.

## Reservations (brick 4)
- Reservations list: "Not assigned" repeated under every row's room (drop it until rooms are assigned, bricks 7–8).
- Deposit due shown date-only in places ("by 29 Nov"); show the time wherever the due time matters.
- New reservation, step 1: the summary aside is nearly empty; fill it (hotel, nights, party) or hide it on that step.
- Demo seed: audit events' `createdAt` is the seed's run time, not the business date each booking was made on.
- Guest and reservation search: say "Type at least 3 characters" for 1–2 characters instead of showing nothing.
- New reservation dates use the browser's native date inputs: swap for a design-system date range picker once one exists in `components/ui` (none today; not built here on purpose).
- New reservation: Continue looks enabled while the quote refreshes (window focus) and only says "Checking the price. One moment." on click, so the person clicks twice; show a busy state on the button while refetching.

## Approvals (brick 5)
- New reservation, Review: `ApprovalStatus` builds a fake approval view with `as never` to reuse `answerLine`; give `answerLine` a narrow input type (status, approver name, times, comment, percent) instead.
- The waiting poll (every 3 seconds) reads the whole request with `approvals.get`, draft included; add a slim status read (status, approver, times, comment) for it.
- Bell badge: `text-white` on `bg-ro-dot`; check the contrast against the tokens in light and dark (or use a token for text on a status dot).
- Bell: move focus into the panel when it opens (first row or See all), and back to the bell on close by click outside.

## Modify, cancel and no-show (brick 6)
- Modify: a night sold out under the agent's feet answers "Deluxe King was just sold for 12 Dec." without suggesting another type; add brick 4's "N Executive King rooms are free for that night." (needs the alternatives helper shared from `book.ts`).
- A change, cancel or no-show sent just before the connection dropped isn't retried automatically on reconnect; the dialog keeps its idempotency key, so pressing the button again is safe ("Checking whether VI-2611-0447 was cancelled…" isn't shown).
- Copy cancellation ends "Questions? Reply to this message." until hotels have a front desk number to quote ("WhatsApp us on …").
- Demo seed: changes are made on earlier business dates but their timestamps are the seed's run time, so a banner can read "Cancelled 27 Nov 2026, 19:07 (business date 26 Nov)".
- The Modify dialog lists up to three new nights, then "and N more new nights"; a room type change on a long stay could show the nights in a collapsible list.
- Discount approvals on a changed stay can't be continued from the inbox ("Continue booking" is for new bookings); closing the dialog withdraws the request.
- `writeNights` updates every kept night even when its sold price and extra adult are unchanged (`reservations/change/modify.ts`); update only the ones that differ.
- Add a schema comment on `penalties.waived_by_*`: when an inbox approval applies the waiver, these name the requester (the approver is in `approver_*` and is the audit event's actor).
- `penalties.approval_id` has no foreign key to `approvals`.
- An `approvalId` sent with a modify whose discount is within the saver's own limit is still checked and consumed (`reservations/change/modify.ts`, as brick 5 does at Book); decide whether to refuse it instead.

## Tape chart (brick 7)
- The move-to-another-type drop opens the Room move dialog rather than the spec's own popover; a compact popover could come later if the desk prefers it.
- The Keep-rate line says "A manager with a higher limit can approve it" instead of naming them ("Tunde or Adaeze"); the approval prompt lists them.
- The out-of-order refusal says "Ask your GM." rather than naming the hotel's GM.
- Columns beyond the window aren't fetched on horizontal scroll (Previous / Next week instead); fine for 120 rooms × 30 nights.
- The sync queue's "needs a look" list shows only on the tape chart; a shell-wide queue panel comes with the next offline module (check-in, POS).
