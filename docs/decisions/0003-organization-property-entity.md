# 0003 · Organization, property and entity

- **Date:** 2026-11-25
- **Status:** accepted

## Context
A hotel group runs several properties, often owned by different legal companies under a holding company. Operations happen per hotel, books are kept per company, and owners want to see the whole group.

## Decision
The **organization** (Better Auth organization) is the customer and the data boundary: every domain table has `organizationId`, taken only from the auth context. Inside it, **properties** are hotels and own operational data (rooms, reservations, folios, POS, housekeeping, stock), and **entities** are legal companies that own ledgers, bank accounts, payroll and contracts. One entity can own several properties. Members can be limited to properties or entities, and the server enforces it on every query.

## Consequences
- Every query filters by organization; operational queries also by property; finance queries also by entity.
- Shared master data (guests, corporates, suppliers, menus) is set once per organization and used across properties.
- Tests must cover cross-organization isolation and cross-property scoping.
- The word "tenant" is never used in code.

## Alternatives considered
- One organization per hotel: breaks group dashboards and shared guests, and forces account switching.
- Properties without entities: can't produce correct per-company ledgers and payroll.
