---
name: channel-manager
description: How we integrate one channel-manager provider behind a ChannelProvider interface — mapping room types and rate plans to channels, ARI push (debounced, on every change, full resync), ingesting OTA reservations, modifications and cancellations idempotently with raw payloads, availability locking on ingest, overbooking handling, OTA virtual cards via tokenisation, commissions, parity checks, and sandbox testing. Use for any code that touches distribution, OTA bookings or ARI.
---

# Channel manager integration

We connect to OTAs (Booking.com, Expedia, Airbnb, Hotels.ng, …) through **one** certified channel-manager provider, never directly. The provider is an open question in `docs/DOMAIN.md` (e.g. SiteMinder, Channex, a local provider). Once chosen, **always confirm endpoints, payload shapes, rate limits, webhook semantics and certification requirements against that provider's current docs**. This file describes *our* rules; the provider's docs are the source of truth for *their* API.

## Architecture
```
apps/api/src/integrations/channels/
  provider.ts        ChannelProvider interface + shared types (domain-facing)
  <provider>/
    client.ts        typed fetch wrapper (keys from env/encrypted DB, timeouts, retries on 5xx/429 with backoff)
    webhook.ts       Hono route: verify auth/signature → store raw event → enqueue job → 2xx
    mapping.ts       provider payload <-> our types
  ari.ts             builds ARI deltas from our inventory, rates and restrictions
  jobs.ts            ARI push queue, reservation ingest, full resync, parity check
apps/api/src/integrations/channels/mock/   in-memory provider for tests and local dev
```
`ChannelProvider` exposes roughly: `pushAri(deltas)`, `fullResync(propertyId, range)`, `fetchReservations(since)`, `ackReservation(ref)`, `getMappings()`, `parseWebhook(raw)`. Domain code never imports a concrete provider.

## Mapping
- `channel_mappings`: propertyId, channel, our roomTypeId / ratePlanId ↔ provider room/rate codes, active flag. Unique per `(propertyId, channel, providerRoomCode, providerRateCode)`.
- Only mapped and active rate plans are pushed. Derived plans (BAR − 10%) push their computed price.
- An unmapped incoming room/rate code is **not** guessed: the reservation is ingested to a review queue with an alert.
- Mapping changes trigger a full resync of the affected property.

## ARI push
- **On every change** to availability, rates or restrictions (bookings, cancellations, modifications, OOO, group blocks and releases, rate edits, restriction edits), the transaction writes an `ari_change` row (propertyId, roomTypeId, ratePlanId, date range, kind) in the same transaction. No change is pushed from outside a committed transaction.
- A worker **debounces** changes per property (a few seconds), coalesces date ranges, reads the **current** values (not the values in the change row) and pushes deltas. Respect the provider's rate limits and batch sizes.
- Pushes are retried with backoff; failures stay visible on a **Distribution health** screen and alert the revenue manager after a threshold.
- **Full resync** on demand (button, after mapping changes, after an outage) and on a schedule (e.g. nightly) for a rolling window (e.g. 365 days, configurable).
- Availability pushed = our sellable count (respecting the per-channel allocation if configured), never more than actual availability plus the configured overbooking limit.
- Rates are pushed in the currency and tax-inclusivity the channel mapping specifies.

## Ingesting OTA reservations
- Webhook or poll (per provider): verify authenticity per the provider's docs, **store the raw payload first** (`provider_events`: provider, type, channel, channel reference, raw JSON, received_at, processed_at, error, attempts), then process in a job.
- Idempotent by **channel reference** (+ channel + property). A unique constraint on `(propertyId, channel, channelReference)` on the reservation; replays are no-ops. Keep the provider's revision/version number and ignore anything older than what we have (out-of-order delivery).
- **New booking:** in one transaction, lock the room-type inventory rows for each date in date order (`FOR UPDATE`), create the reservation (`source: ota`, channel, channel reference, guest, stays, rate plan, prices as sent, commission), decrement availability, write `ari_change`. Then acknowledge to the provider if it requires acks.
- **Modification:** matched by channel reference; apply as a diff (dates, room type, guests, price) under the same locking; keep the history of what changed and the raw payload. If the reservation is already checked in, don't auto-apply date changes: send to review.
- **Cancellation:** matched by channel reference; set `cancelled`, release inventory, apply the channel's policy outcome (OTA penalties are usually collected by the OTA; record as sent).
- Prices and taxes are stored as delivered by the channel; we post our own tax lines at night audit from our rules. Discrepancies between OTA-quoted taxes and ours are flagged, not silently corrected.
- Guest details from OTAs are personal data under the NDPA: same encryption, masking and retention rules as direct guests. OTA proxy emails are stored as given.

## Overbooking
- An OTA booking is accepted from the channel even if it takes availability below zero (the OTA has already confirmed it to the guest). We **never reject or drop** it.
- If it exceeds the configured overbooking limit, mark the reservation `overbooked`, raise an alert (in-app + WhatsApp/email to the revenue manager and duty manager), and push zero availability immediately for those dates.
- The overbooking report lists affected dates, room types and candidate actions (upgrade, move, walk to a partner hotel).

## OTA virtual cards (VCC)
- Prepaid OTA bookings may include a virtual card. We **never store, log or display** raw card numbers, CVV or expiry. Use the provider's tokenisation / card vault (or a PCI-compliant vault it integrates with) and store only the token, last 4, expiry month/year if returned, activation date and amount.
- Charging a VCC happens through the provider's or payment processor's tokenised charge, on or after the activation date, with permission and logging. Record as a `card_online` payment on the folio with the processor reference.
- If the provider can't tokenise, the VCC is viewed in the OTA's extranet by authorised staff and charged on a POS terminal; we record only the payment.

## Commissions
- Store commission per reservation (rate % and amount, currency, source: delivered by channel or computed from the channel's configured %).
- Net room revenue = gross − commission for analytics; the commission is a cost booked when the OTA invoice is recorded (payables), not a folio posting.
- Monthly OTA invoice reconciliation compares billed commissions vs our records and flags differences.

## Parity check
- A job compares the rate we push per channel with our booking engine price for the same room type, rate plan, date and occupancy (tax-inclusive on both sides) and lists disparities on a **Rate parity** view.
- If the provider offers shopping/parity data, use it as a second source; never scrape OTA sites.

## Testing
- Unit-test mapping, ARI delta coalescing and debouncing, idempotent ingest (duplicate, out-of-order revisions), modification diffs, cancellation release, overbooking flagging, and commission calculation using recorded fixture payloads.
- Concurrency test: an OTA booking and a front-desk booking for the last room at the same time; availability never double-sells silently and the overbooking path fires.
- Integration tests run against the `mock` provider. One opt-in suite runs against the provider's **sandbox / test property** only, with test credentials; never against a live property or live OTA listing.
- Certification scenarios required by the provider are scripted as e2e tests where possible.

## Env vars (document in `.env.example`, no values)
`CHANNEL_PROVIDER` (e.g. `mock`), `CHANNEL_PROVIDER_API_KEY`, `CHANNEL_PROVIDER_WEBHOOK_SECRET`, `CHANNEL_PROVIDER_BASE_URL`
