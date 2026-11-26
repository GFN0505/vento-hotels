# 0023 · Two-step sign-in with an authenticator app, optional for now

- **Date:** 2026-11-26
- **Status:** accepted

## Context
Decision 0017 promised two-step sign-in for managers. Hotels' owners and GMs hold the keys to rates, refunds and people. The owner's top rule is that Vento stays simple. SMS and WhatsApp providers are still open questions.

## Decision
- Use Better Auth's two-factor plugin: time-based codes from an authenticator app (TOTP), 10 single-use backup codes, and "trust this computer for 30 days". Five wrong codes lock code entry for 15 minutes.
- Optional for everyone. Owners and group admins without it get a clear prompt on Home. Whether a group can require it is an open question for pilot hotels.
- Turning it on or off needs the password and is audited in every group the person belongs to.
- Manager approval by PIN moves to Stage 1, built with the first action that needs it (rate override at check-in), instead of now with nothing to approve.

## Consequences
- A stolen password alone no longer opens an account with two-step on.
- Lost phone and no backup codes means the person can't get in until they're helped. An owner reset isn't built yet (open question).
- SMS codes can be added later behind the `SmsProvider` interface without changing the sign-in screen.

## Alternatives considered
- **Required for all managers now:** safer, but extra friction at every first sign-in before pilots have asked for it.
- **SMS codes first:** needs a provider (open question), costs money per message, and SIM swaps make it weaker.
- **Passkeys:** excellent, but support on the older Android phones common in hotels is uneven. A good later addition.
