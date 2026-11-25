# 0002 · Nigeria-first hotel groups, ten modules in stages

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Legacy PMS products used in Nigeria are either foreign systems that ignore local payments, taxes and power cuts, or local tools that cover only the front desk. Groups that run several hotels across states have no single system for rooms, F&B, stores, finance and payroll.

## Decision
Build for Nigeria first, with hotel groups and chains as the main customer (single independent hotels are welcome on the same product). All ten modules in `docs/PRODUCT.md` are in v1, built in stages 0–6, each stage usable by a pilot hotel on its own.

## Consequences
- NGN, bank transfer, POS terminals, Paystack, VAT plus state consumption tax, NDPA 2023 and power cuts are first-class, not add-ons.
- Group features (shared guests, corporates, rates, consolidated reports) shape the data model from stage 0.
- Each module stays lean; features outside its scope need the owner's approval.
- Other countries are possible later but not designed for now.

## Alternatives considered
- Front desk only in v1: groups would still need other tools, and leakage controls need every module.
- Global from day one: slows delivery and dilutes Nigerian specifics that win customers.
- Single hotels as the main customer: smaller deals, and group needs are harder to add later.
