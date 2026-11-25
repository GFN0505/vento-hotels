# 0007 · Locked availability; OTA overbookings are accepted and flagged

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Rooms are sold at the desk, on the booking engine and on OTAs at the same time. Two sales for the last room must never both succeed silently. But an OTA has already confirmed its booking to the guest before we hear about it.

## Decision
Every availability change (book, modify, cancel, channel ingest) runs in one transaction that locks the room-type inventory rows for each date, in date order. Our own channels can't sell past availability plus the configured overbooking limit. An OTA booking is always accepted, even below zero: if it goes past the limit, the reservation is marked `overbooked`, the revenue and duty managers are alerted, and zero availability is pushed to channels at once. We never reject or drop an OTA booking.

## Consequences
- A concurrency test for the last room is required.
- The overbooking report lists affected dates, room types and options (upgrade, move, walk).
- Overbooking limits per room type are configuration per organization.

## Alternatives considered
- Reject OTA bookings over availability: the guest still arrives with a confirmation; rejecting just hides the problem.
- No locking, fix later: double sales go unnoticed until check-in.
