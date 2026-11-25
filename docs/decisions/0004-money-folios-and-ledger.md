# 0004 · Money as decimals, append-only folios and ledger

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Guests pay in NGN and foreign currency, by cash, transfer, POS terminal and card. Owners fear leakage through edited or deleted charges. Every naira must trace from charge to folio to settlement to ledger, and floating-point errors are unacceptable.

## Decision
Amounts are `numeric(14,2)` in Postgres, strings in TypeScript, calculated with a decimal library. Currency (ISO 4217, default NGN) sits beside every amount; foreign amounts also store the FX rate, its source and date. Folio postings and ledger entries are append-only: a void or correction is a new reversing posting linked to the original, with a reason and user. Each charge stores its tax lines (rate, base, amount) at posting time and they are never recomputed. The ledger is double-entry per entity and every entry balances.

## Consequences
- No `number` type for money anywhere, enforced in review.
- Folio balances are derived from postings, never stored as editable totals.
- Append-only is enforced in Postgres as well as in code: these tables carry the `vento_forbid_update_delete()` trigger from migration 0000.
- A change in tax rates never alters past postings.
- Multi-table money writes always run in one transaction.

## Alternatives considered
- Integer kobo: awkward across currencies and FX, and rates still need decimals.
- Editable postings: faster to build, impossible to audit, and the main leakage route.
- Computing tax on the fly from current rules: past invoices would change when rules change.
