# 0010 · One channel-manager provider behind an interface

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Hotels need two-way sync with Booking.com, Expedia, Airbnb, Hotels.ng and others. Direct connections to each OTA need separate certifications and maintenance.

## Decision
Connect to OTAs through one certified channel-manager provider, behind a `ChannelProvider` interface. Domain code never imports a concrete provider. A `mock` provider serves tests and local development. Incoming reservations store the raw payload first and are ingested idempotently by channel reference.

## Consequences
- The provider is **not chosen yet** (e.g. SiteMinder, Channex, a local provider); it stays an open question in `docs/DOMAIN.md` until stage 4 planning, and gets its own record when chosen.
- Once chosen, its current docs are the source of truth for its API and certification.
- OTA virtual cards are handled only through tokenisation; raw card data never touches our servers.
- Switching provider later means a new adapter, not a domain rewrite.

## Alternatives considered
- Direct OTA connections: many certifications, slow and costly to maintain.
- Several providers at once: doubles mapping and support work with no clear gain.
- Choosing the provider now: we'd decide before comparing pricing, Nigerian OTA coverage and certification.
