# Rooms left on the Rate calendar

- **Status:** approved (owner, 2026-11-28), with both answers below.
- **Stage:** 1, brick 9b in [stage-1-plan.md](stage-1-plan.md), after Cashier shifts (9). Depends on Rate plans (2, the Rate calendar), Availability and new reservations (4, the per-date room-type inventory) and the tape chart (7, out of order).
- **Module:** Rates & channels (read), for the front desk and revenue.
- **Screens:** Rates and restrictions grid (#8, `RatesGrid`), Rates tab only. No new screen.
- **Decisions:** none new.

## Problem
A guest rings: "Any Deluxe Kings from Friday?" Today Chiamaka at the desk has to start a booking, or scroll the tape chart to the Available row, to find out. Revenue sets Friday's price on the Rate calendar without seeing that only one Deluxe King is left. Design #8 puts a **Rooms left** row under each room type on the Rate calendar; it was left out in brick 2 because the inventory came in brick 4.

## Persona and job
- **Front desk** (Chiamaka, front desk PC, many times a shift): see at a glance how many rooms of each type are left on each night, without starting a booking. Read-only: she already opens the Rate calendar to quote by phone (`reservation.manage`).
- **Revenue manager and GM** (Sade, Tunde; laptop): price and close nights knowing how full each type is.

## Success looks like
- Each room type on the Rate calendar has a **Rooms left** row, one number per night, equal to the tape chart's Available row and New reservation's "N left" for the same hotel, type and night (server test against the same seed).
- A room out of order takes one off every night it's out; a booking takes one off every night of its stay; a cancellation gives it back.
- Sold out and nearly sold out stand out without reading every number.

## Behaviour
1. **Where:** a row headed **Rooms left** directly under each room type's name, above its plans, on every night shown (14 or 30). Plain numbers, centred, tabular; not focusable and not part of the arrow-key cell navigation (it isn't editable).
2. **The number:** rooms of the type that can be sold that night (active rooms less those out of order) less rooms booked that night. The same figure as the tape chart's Available row (`roomsOn(capacity, date) − booked`).
3. **Overbooked:** a night with more bookings than sellable rooms shows **−1** (−n) in red, with "1 more booking than rooms" on hover and for screen readers, as on the tape chart.
4. **Highlights** (owner's answer 1): 0 and below in red, 1–2 in amber, the rest muted, as on the tape chart.
5. **Phones (below md):** one room type at a time as now; each night's card shows "**4 left**" (or "Sold out", "1 more booking than rooms") in its heading, coloured the same way.
6. **Hotel switch:** follows it like the rest of the calendar; All hotels keeps "Pick a hotel".
7. **Offline:** shown from the last copy the calendar kept, with the existing "Showing rates from …" offline note, which now reads rates and rooms left. Nothing to edit, so nothing queued.
8. **Freshness:** a booking, change, cancellation, check-in, room move or out-of-order change made in this app shows on the calendar the next time it's opened or the window comes back into focus, once the copy on screen is more than 30 seconds old (the app's usual refresh).
9. **Screen readers:** the row is a table row whose header is "Rooms left"; each cell reads "4 rooms left, Fri 4 Dec" (via the column header) and "Sold out" for 0.

## Not in this brick
- Editing inventory, overbooking limits or stop-sell from this row.
- Channels and Parity tabs (Stage 4).
- Starting a booking from a Rooms left number, and a "Rooms left tonight" summary on the Front desk page: later, if the owner wants them.

## API
`rates.calendar` gains `roomTypes[].left: { date, left, outOfOrder }[]`, one per date, read without locks from `room_type_inventory` and the type's active rooms and out-of-order periods (the same helpers the tape chart and New reservation use). Same permission as the calendar (`rates.edit`, `rooms.setup` or `reservation.manage`), same organization and property scoping.

## Owner's answers (2026-11-28)
1. **Highlights:** as on the tape chart: 0 and overbooked in red, 1–2 in amber, the rest muted (the design's 1-only amber is logged in `docs/design/CHANGES.md`).
2. **From the Front desk:** no new link in this brick. A "Rooms left tonight" line on the Front desk page is decided with the role homes.
