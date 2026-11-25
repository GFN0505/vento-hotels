# 0014 · One branch and pull request per brick; pinned dependencies

- **Date:** 2026-11-25
- **Status:** accepted

## Context
The product is built in small steps ("bricks") by AI agents and reviewed by the owner. Unreviewed changes, surprise dependency updates and freshly published packages (a supply-chain risk) must not slip in.

## Decision
- Each brick is its own branch and pull request. CI must pass, and the owner merges.
- Tool and dependency versions are pinned exactly (no `^` or `~`), and only versions at least two weeks old are chosen.
- pnpm `minimumReleaseAge` is set to 7 days, so installs refuse anything newer.
- Commits carry no AI attribution.
- Biome lints and formats code and JSON but not Markdown.

## Consequences
- Upgrades are deliberate pull requests, not side effects of an install.
- Small pull requests are easier to review and revert.
- Markdown formatting is kept by hand and by review.

## Alternatives considered
- Commit straight to `main`: no review gate and no CI before changes land.
- Caret ranges: builds change without anyone deciding.
- Latest versions immediately: exposed to compromised or broken releases.
- Formatting Markdown with Biome: rewraps tables and prose in docs for no gain.
