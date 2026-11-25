# 0005 · Statutory rules are data with effective dates

- **Date:** 2026-11-25
- **Status:** accepted

## Context
VAT, state consumption tax, service charge, WHT, CIT and payroll deductions (PAYE, pension, NHF, NSITF, ITF) change with law, differ by state, and Nigeria's 2025 tax reform acts take effect from 2026.

## Decision
Statutory rules live in versioned configuration with effective dates (and state where relevant), never in code constants. Calculations pick the rule in force on the relevant business date. Seed values are illustrative and must be checked against current law before use.

## Consequences
- A law change is a new dated rule, not a deploy.
- Back-dated reports use the rules that applied at the time; posted tax lines are already fixed (see 0004).
- Which states' consumption tax rules ship first, and e-invoicing requirements, are still open in `docs/DOMAIN.md`.

## Alternatives considered
- Hard-coded rates: every change needs a release and breaks historical reports.
- One rate per organization without dates: can't handle mid-year changes.
