---
name: brand
description: How Vento Hotels presents itself — the Vento product family and naming, logo and lockup rules, colour and type roles, positioning, voice, approved taglines and boilerplate, honesty rules for claims, and the formats for the sign-in panel, website, pilot outreach, one-pagers, decks and app store listings. Use for any brand or marketing copy or asset, and for the brand surfaces inside the app (sign-in panel, onboarding, marketing emails).
---

# Brand

The voice for words *inside* the product (buttons, errors, guest messages) is the `ux-writing` skill. This skill covers how Vento *presents itself*: the name, the mark, the promise and the copy that sells it. Approved copy lives in `docs/marketing/` (the copy library); use it before writing anything new.

## The Vento family
- **Vento** is the masterbrand. Each product is **Vento + what it serves**: **Vento Hotels** (this product), **Vento Real Estate** (developers). Future products follow the same pattern.
- First mention in any piece: **Vento Hotels** in full. After that, "Vento" is fine when the context is clear.
- In visual places (sign-in panel, phone header, sidebar, emails, decks) use the lockup: the mark, then **Vento**, a thin divider, then **Hotels**. In code: `<Logo wordmark product />`.
- Never: "Vento for Hotels" as a name, "VentoHotels", "Vento-Hotels", "VENTO HOTELS", or a new sub-brand for a module ("Vento Desk", "Vento POS"). Modules have plain names: Front desk, Restaurant & bar, Housekeeping, Night audit.
- Shared across the family: the mark, the navy, the violet, the voice. Different per product: the headline, the proof and the examples (hotels talk rooms and covers, not plots and titles).

## The mark
- A V with a dot (from the approved designs): V `#6D64F4`, dot `#5EC4EA`, round ends, stroke 13 on a 100-unit grid. In code, the `--logo-v` and `--logo-dot` tokens and `apps/web/src/components/logo.tsx`; never redraw it.
- Clear space around the mark: at least the dot's diameter. Smallest size: 16px (favicon), 24px with the wordmark.
- Backgrounds: white, the light page background, or the navy. On photos only over a dark, calm area.
- Print and black-and-white documents: solid black mark (see `printing`).
- Don't recolour, outline, stretch, rotate, add shadows or put the mark in a container shape.

## Colour and type roles
- **Navy** (`--side`, `#0E1630`) is the brand ground: sign-in panel, sidebar, decks.
- **Violet** (`--brand` `#7677FB`, buttons `--pri`) is for action. Don't use it for decoration.
- **Cyan** (`--logo-dot` `#5EC4EA`) is the accent: at most one short phrase or detail per surface (e.g. "accounted for.").
- **Fraunces** (`font-display`, the variable font with optical sizing) for brand headlines only: the sign-in panel and phone band, website and deck titles. Regular weight, slight negative tracking, and the one accent phrase in Fraunces italic and cyan ("*accounted for.*").
- **Inter** for everything else, including every screen inside the app, forms, labels and body copy. Never use Fraunces for UI, numbers, tables or buttons.
- Light mode is the default everywhere people first meet Vento.

## Positioning
- **For:** owners, MDs and GMs of Nigerian hotel groups and chains (and independent hotels that want the same quality).
- **The promise:** every room, every naira and every night accounted for, across every hotel in the group.
- **Why believe it (proof pillars, in this order):**
  1. **Control:** leakage made visible to the owner, by name, the next morning.
  2. **Built for here:** works through power and internet cuts; naira, transfers and POS terminals, VAT and state consumption tax, WhatsApp.
  3. **One view of the group:** every hotel, one place, one standard.
  4. **Calm and fast:** a new front desk agent checks in their first guest in under 5 minutes.
- **Against:** cluttered legacy PMS software and spreadsheets. Describe the problem (lost revenue, no visibility, systems that stop when the light goes); never name or attack a competitor.

## Voice
Confident, calm, premium, plain. A trusted advisor to an owner, not a salesperson.
- Outcomes before features: "know exactly how each hotel is doing", not "dashboard with 14 KPIs".
- Short sentences. One idea each. Concrete nouns: rooms, naira, nights, guests.
- Nigerian context, never caricature. Nigerian English spelling.
- No hype or filler: "revolutionary", "game-changing", "seamless", "cutting-edge", "world-class" (as a claim to customers), "leverage", "unlock", "empower", "solution", "best-in-class", "AI-powered". No exclamation marks.
- Respect for staff: leakage copy is about visibility and fairness, never "catch your staff".

## Approved lines
Use these as written; propose changes to the owner instead of drifting.

| Use | Line |
|---|---|
| Headline | Every room. Every naira. Every night, accounted for. |
| Eyebrow | For hotel groups in Nigeria |
| Support line | Run every hotel in your group from one place, and know exactly how each one is doing. |
| Short descriptor | The operating system for Nigerian hotel groups. |
| Boilerplate (about 50 words) | Vento Hotels runs every hotel in a group from one place: front desk, restaurant and bar, housekeeping, stores and the books. Built for Nigeria, it keeps working through power and internet cuts, handles naira, transfers and local taxes, and shows owners exactly what happened in each hotel, every morning. |

## Honesty rules
1. **Only claim what's shipped.** Check `CHANGELOG.md` and the release plan in `docs/PRODUCT.md`. Anything not yet released is "coming" (or left out) and needs the owner's OK to mention at all. The boilerplate describes the full product: until Stage 6 ships, use it only with pilots who know the plan, or trim it to what's live.
2. **No invented proof:** no made-up customers, logos, testimonials, statistics, savings figures or awards. Examples use the demo world (Kora Hotels Group) and say they're examples.
3. **Careful with compliance claims:** say "handles VAT and state consumption tax"; never "guarantees compliance" or "FIRS-approved" unless it's true and documented.
4. **Marketing messages need consent** (NDPA 2023): no WhatsApp, SMS or email marketing to people who didn't opt in; every message says how to stop.
5. **Never use a real hotel's name or photos** without written permission.

## Formats
| Surface | Shape |
|---|---|
| Sign-in brand panel | Lockup · eyebrow · headline · one support line · footer. No feature list. Motion: slow drifting light, a faint dot grid, the mark drawing itself, copy rising in; calm, never looping text or flashing, and still with reduced motion. |
| Website hero | Headline · support line · one call to action ("Book a demo" or "Start your setup") · a calm product screenshot from the demo world. |
| Pilot outreach (email or WhatsApp, with consent) | Under 120 words: who we are, the one outcome, what a pilot involves, one question to reply to. |
| One-pager | Promise · the four proof pillars, one line each · how a pilot works · contact. |
| Deck | One idea per slide, navy title slides, real screens from the demo world, no feature walls. |
| App store listing | Short descriptor · boilerplate · 3–5 outcome bullets. |
| Marketing and onboarding emails | From "Vento Hotels"; transactional emails (confirm, reset, invitations) follow `ux-writing` instead. |

## Process
1. Start from the copy library in `docs/marketing/` and the approved lines above.
2. Draft, then check every claim against the honesty rules and the voice list.
3. The owner approves anything public. Record approved copy in `docs/marketing/` with the date.
4. Changes to brand surfaces in the app (sign-in panel, onboarding) go through the frontend agent, and departures from the approved designs are logged in `docs/design/CHANGES.md`.
