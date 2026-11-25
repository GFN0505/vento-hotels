# 0012 · The repository is public

- **Date:** 2026-11-25
- **Status:** accepted

## Context
The owner chose to host the code publicly on GitHub.

## Decision
The repository is public. Secrets never enter it: `.env` is git-ignored and keys are documented in `.env.example`. A secret scan runs before every commit and in CI. Seed, fixture and demo data are fictional (the Kora Hotels Group world).

## Consequences
- No customer data, real guest or staff names, real hotels, or credentials in fixtures, docs, tests or screenshots.
- Provider sandboxes use test credentials kept outside the repo.
- Security relies on server-side checks, never on obscurity.

## Alternatives considered
- Private repository: hides mistakes rather than preventing them; can be revisited if commercial reasons require it.
