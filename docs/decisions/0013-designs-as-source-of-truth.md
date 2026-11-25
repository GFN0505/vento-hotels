# 0013 · The Claude Design export is the source of truth for UI

- **Date:** 2026-11-25
- **Status:** accepted

## Context
The screens were designed and approved in Claude Design: 46 screens with dark, mobile and state variants. Docs and skills written earlier sometimes disagree with them.

## Decision
The export in `docs/design/export/` is the source of truth for UI. When docs or skills disagree with it, follow the designs and fix the docs. Tokens come from its `vento.css`. The font is **Inter**, chosen in the design over Poppins because it stays readable in dense tables, tape charts and folios. The demo world is the made-up **Kora Hotels Group** (Kora Victoria Island, Kora Ikeja GRA, Kora Abuja, Kora Port Harcourt), used by the designs, the walkthroughs in `docs/journeys/` and the demo seed.

## Consequences
- New design rounds are re-exported and replace the folder in one commit, then the screen inventory and affected docs are updated.
- The export files only render inside Claude Design; here they are read as reference for layout, copy, states and values.
- Tax amounts in the designs are illustrative; real rates come from configuration (see 0005).

## Alternatives considered
- Docs as the source of truth: the designs carry more detail and were approved by the owner.
- Poppins: friendlier but wider and harder to scan in dense screens.
- Demo data invented per feature: walkthroughs, seed and designs would drift apart.
