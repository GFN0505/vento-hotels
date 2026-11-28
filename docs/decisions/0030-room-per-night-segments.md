# 0030 · A stay keeps its room per night through room segments

- **Date:** 2026-11-28
- **Status:** accepted

## Context
Brick 7 kept one room per stay (`stays.room_id`) and an exclusion constraint so a room holds one confirmed or checked-in stay a night over `daterange(arrival, departure)`. With check-in (brick 8), a guest who is already in house can move rooms: Mr Kalu slept in 503 on 23 and 24 Nov and moves to 501 from 25 Nov. The nights before the business date must keep their room (night audit posts each night against that night's room, and the room status reports read it), while the stay's current room must still be protected by the database. The front desk spec suggested a room column on every night with a per-night unique index, or room segments with the same guarantee.

## Decision
- `stays.room_id` stays the room **from `stays.room_from` on** (null `room_from` means from arrival). The exclusion constraint on stays now covers `daterange(coalesce(room_from, arrival), departure)` for confirmed and checked-in stays.
- An in-house move from the business date writes the nights before it as a **room segment** (`stay_room_segments`: stay, room, room type, from, to) and sets `room_from` to the business date. A second move on the same business date writes no segment (no night was used in between).
- Segments have their own exclusion constraint. They only ever cover nights **before** the business date, which no service can assign again (assignments, moves, bookings and out of order all start on or after the business date), so the current segments and the past segments can't overlap.
- Every "is this room free" read (`roomConflict`, `busyRooms`, out-of-order checks, room counts, the tape chart) uses `coalesce(room_from, arrival)` for the stay's current room; the tape chart and the room history also draw the past segments.
- The room of a night `d` is the segment covering `d`, else `stays.room_id` (night audit, brick 13).

## Consequences
- No change to how confirmed stays are written: bookings, assignments, modifies and the seed's bulk writes don't touch segments, so brick 7's code and tests stay as they are.
- Code that reads a stay's nights in a room must use `room_from`; the review checklist greps for `stays.arrival` next to `room_id`.
- Correcting the room of a past night isn't possible (out of scope, and it would need an audit correction).

## Alternatives considered
- A room column on every `stay_nights` row with a unique index per room and night: the strongest guarantee in one place, but every write path (book, modify, cancel, no-show, check-out, the seed's bulk writes) would have to keep the column and a "holds room" flag in step, a large change to brick 7's tested code for the same guarantee.
- Splitting the stay into two stays at a move: breaks the one-stay-one-folio model brick 10 builds on.
