# 0006 · Business date moves only at night audit

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Hotels account by a business day, not the calendar. Guests arrive after midnight, the bar runs late, and the day's room charges must post exactly once.

## Decision
Each property has a business date. Charges, revenue and reports use it, never the wall clock. It moves forward only when night audit completes: checks (arrivals, departures, open POS checks, unbalanced shifts), no-shows, room and tax charges, daily reports, ledger posting, then roll the date. Night audit runs once per date per property and is idempotent.

## Consequences
- The business date is always visible in the app and flagged when it differs from the calendar date.
- Corrections to a closed date need a higher permission and post to the current date with a link to the original.
- Night audit steps run as background jobs that can resume after a failure.
- Night audit can't run offline.

## Alternatives considered
- Calendar date at midnight: splits late-night activity across days and double-posts or misses room charges.
- Manual date changes: open to abuse and mistakes.
