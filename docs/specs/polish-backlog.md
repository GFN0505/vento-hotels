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
- Code-review minors: undo message names the last actor of any plan event (should be the dates' last editor); percentage message says 1–100% but accepts 0.01; no ₦100,000,000 cap on derived prices; secondary rates queries filter by plan ids only (add organizationId); advisory lock taken before the scope check in create/createFirst/reorder; plan-writes.ts header comment lock order; Number.parseInt on money strings in plan-form-model.ts and preview-model.ts (use dec().toFixed(0)); planHasHistory per row in planViews (batch it when brick 4 fills it in); seed rate dates fixed at Dec 2026.

## Earlier bricks
- Hotel switch: the native hotel select can't show options in screenshot tools (consider a custom listbox in the polish pass).
- Rate plan Change history: before → after details show only for members with audit.view; add before/after to ratePlans.history so revenue managers see them too.
