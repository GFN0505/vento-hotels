# Design changes log

The designs in `export/` are the source of truth and are never hand-edited. When a built screen deliberately differs from its approved design, record it here so the design can be updated in the next Claude Design round.

## Rules
- Add a row in the same change that builds the difference. No silent departures.
- Name the screen as in `screen-inventory.md`, with its design number and board file (e.g. `TapeChart.dc.html`).
- Say why: a rule in `docs/DOMAIN.md`, an accessibility or performance problem, a walkthrough step that didn't work, or an owner decision.
- Small fixes that match the design system (spacing, a token) don't need a row; anything a person would notice does.
- When the next design round includes the change, set "Needs design update?" to `done (round n)`.

| Date | Screen (#, board) | What changed | Why | Needs design update? |
|---|---|---|---|---|
| 2026-11-25 | Sign in and access states (#24, `AuthSignIn.dc.html`), onboarding first steps (#19) | Split layout instead of a centred card: navy brand panel ("Rooms, restaurant, housekeeping and money in one place.") beside the form on desktop, form alone under the logo on phones. Taller fields (44px) and main button (48px). "Keep me signed in on this device" is unticked, with "30 days. Don't tick this on a shared computer." | Owner decision: match Vento Real Estate's sign-in so the products feel like one family. Unticked by default because hotel front desks share computers. | Yes |
| 2026-11-25 | Sign in (#24), get started (#19) | Sign-up asks for the password twice; every password field has a show/hide button; error text "Invalid email or password"; forgot and reset password pages built | Owner's review of brick 7 | Yes |
| 2026-11-25 | All screens | Light mode by default; dark mode is opt-in per person | Owner decision | No |
