---
name: paystack
description: How this project integrates Paystack — booking engine deposits and prepayments, guest app folio payments, bank transfers, card tokens for guarantees, webhooks, verification, kobo conversion, reconciliation queue, refunds on cancellation, and testing. Use for any code that talks to Paystack or records online payments.
---

# Paystack integration

Always confirm endpoints, payloads, event names and limits against the current docs at https://paystack.com/docs before writing code. This file describes *our* rules; Paystack's docs are the source of truth for *their* API.

## Architecture
```
apps/api/src/integrations/paystack/
  client.ts        typed fetch wrapper (secret key from env, timeouts, retries on 5xx only)
  webhook.ts       Hono route: verify signature → store raw event → enqueue job → 200
  jobs.ts          process events idempotently
  mapping.ts       kobo <-> decimal naira, Paystack status -> our status
```
Provider code stays behind a `PaymentProvider` interface so it can be swapped or mocked. Domain code (reservations, folios) never imports from `integrations/paystack` directly.

Paystack is per **entity** (the legal company that owns the property): each entity may have its own Paystack account and keys. Store which entity's credentials apply on the property; never mix settlements across entities.

## Money conversion
- Paystack amounts are **integer kobo**. `₦125,000.00` ⇄ `12500000`.
- Convert with the decimal library only: `toKobo(d) = d.times(100).toFixed(0)` and assert it's an integer. Never `Math.round(x * 100)` on a float.
- Paystack here is **NGN only**. A USD rate plan paid by card is charged in NGN at a recorded FX rate (rate, source, date stored on the payment), or not offered online. Confirm current multi-currency support in Paystack's docs before changing this.

## Flows
Every transaction is initialized with our own `reference` and `metadata` (`organizationId`, `propertyId`, `entityId`, plus the target ids below). The reference prefix tells the job what the money is for.

1. **Booking engine deposit or prepayment** (`bkg_<reservationId>_<nonce>`): the amount comes from the rate plan's deposit rule (first night, % of stay, full prepayment), computed on the server, never from the client. The reservation is held `tentative` with its inventory locked for a short hold window; on verified success it becomes `confirmed` and the money is recorded as a **deposit** on the reservation. If the hold expires before payment, release the inventory; a late success for an expired hold goes to the reconciliation queue (re-book if availability allows, otherwise refund).
2. **Guest app folio payment** (`fol_<folioId>_<nonce>`): the guest pays the current folio balance or a part of it. On verified success, post a `card_online` **payment** to that folio. Re-check the balance at posting time; an overpayment stays as a credit on the folio, it is not silently refunded.
3. **Bank transfer**: use Paystack's transfer/bank-transfer payment channel on the same checkout (or a dedicated virtual account per corporate account if we adopt it; check current product availability). Transfers are matched by reference; anything without a reference we can trust goes to the reconciliation queue.
4. **Card on file for guarantees**: a successful charge returns a reusable `authorization` (authorization code, last 4, card type, bank, expiry). Store **only** that token and display fields on the guarantee. Use it later for no-show or late-cancellation penalties per the policy the guest accepted, via Charge Authorization, with its own reference (`pen_<reservationId>_<nonce>`). We never see, log or store a PAN, CVV or expiry from the card form; Paystack's hosted checkout or inline popup collects it. Check current Paystack rules on reusable authorizations and minimum verification charges.
5. **Verification:** never trust the redirect, the client callback or the webhook alone. Call Verify Transaction and check `status === 'success'`, amount (in kobo, equal to what we expected), currency `NGN`, and reference before recording anything.

## Webhooks
- Verify `x-paystack-signature` = HMAC-SHA512 of the **raw body** with the secret key, using a timing-safe compare. Read the raw body before any JSON parsing. Reject otherwise.
- Optionally allow-list Paystack's published webhook IPs (check the docs for the current list).
- Store every event first (`provider_events`: id, provider, type, reference, raw JSON, received_at, processed_at, error, attempts).
- Unique on `(provider, reference, event)` so duplicates are no-ops. Handle events arriving out of order (e.g. a refund event before the charge was processed: retry later, don't fail).
- Respond 200 quickly, do the work in a background job with retries and backoff.
- Recording is idempotent: the payment posting has a unique `(provider, providerReference)`; re-processing the same event never posts twice.
- The job runs in one transaction: verify → post payment / record deposit → update reservation status → mark event processed.

## Reconciliation
- Anything that can't be matched with certainty (unknown reference, amount mismatch, expired hold, closed folio, missing metadata) goes to the **Unmatched payments** review queue with the raw event. Never guess and never post to "a likely folio".
- A daily job compares Paystack settlements (net of fees) against recorded payments per entity and flags differences. Paystack fees are recorded as an expense, not deducted from the guest's payment.
- Deposits paid online are recorded against the **business date** of the property when posted, not the Paystack timestamp.

## Refunds
- Refunds follow the reservation's **cancellation policy** as accepted at booking (stored on the reservation, not looked up from the current plan). The service computes refundable = paid − penalty; the penalty posts as a charge with its tax lines; the refund amount is shown to the agent before confirming.
- A refund needs the `refund` permission **and** a reason, and is logged.
- Create the refund through Paystack's Refund API with our own reference, then record a reversing payment posting linked to the original when Paystack confirms (`refund.processed` or verify). Pending/failed refunds stay visible on the folio.
- Never edit or delete the original payment. Partial refunds are allowed; the sum of refunds can never exceed the original amount (checked in the DB and the service).

## Testing
- Use test secret keys and Paystack's published test cards and test bank details only. Never a real card.
- Unit-test kobo conversion, signature verification (valid, invalid, tampered body), duplicate and out-of-order events, amount and currency mismatches, expired holds, overpayment, refund caps.
- Webhook tests post a recorded fixture body with a signature computed from the test secret.
- E2E: booking engine checkout against a mocked `PaymentProvider`; one opt-in suite runs against Paystack test mode.

## Env vars (document in `.env.example`, no values)
`PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_URL` (per-entity keys, if used, are stored encrypted in the DB, not in env)
