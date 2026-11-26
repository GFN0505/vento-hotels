# Polish backlog

Polish-level review findings, batched for one "polish pass" brick near the end of the release plan (owner's lean working style, 2026-11-26). Must and should findings are fixed in their own brick; only polish waits here. Add to it from every review; remove items when done.

## Taxes, service charge, payment methods and FX rates (brick 3)
- FX rates: each currency's 30-day line is a small inline SVG, not Recharts as the spec says (kept inside the speed budget; recorded in `docs/design/CHANGES.md`). Revisit if the polish pass adds axes or hover values.
- FX rates are stored and entered with up to 4 decimals, but the history and cards show them through the naira formatter at 2 decimals in places (e.g. the check and replace messages); show the full rate wherever a rate (not an amount) is shown.
- `taxes.set_up` audit event carries `liveProperty` and `exception` but not `liveHotelIds` (the per-tax `tax.created` events do); add it so the owner's daily report can place it without reading the batch.
- The owners' email when a live hotel's guest transfer account changes is sent after commit through the queued email provider, not as its own idempotent pg-boss job (`notify.transfer_account_changed`, keyed by the audit event id) as the spec says. A crash between commit and queueing loses the email (the change is still audited and in the morning report).
