# Two-step sign-in

- **Status:** built (brick 12, in review)
- **Stage:** 0
- **Module:** Platform
- **Walkthroughs:** `going-live.md` (Folake turns on two-step sign-in on day one), `owner-morning.md` (signing in on a new laptop)
- **Screens:** Two-step code (#24, `Auth2FA.dc.html`, `Auth2FAM.dc.html`); set-up is a dialog from the account menu
- **Decisions:** `docs/decisions/0017-sign-in-and-tenancy.md`, `docs/decisions/0023-two-step-sign-in.md`

## Problem
An owner's or GM's password opens the whole group: rates, refunds, people and permissions. Passwords get reused, shared and phished. A second step (a code from an app on their phone) stops a stolen password on its own from getting in.

## Persona and job
- **Owner, group admin, GM, finance** (once, two minutes): turn on two-step sign-in with an authenticator app.
- **The same people** (when signing in on a new computer, about monthly): type the 6-digit code; tick "Don't ask again on this computer for 30 days".

## Success looks like
- Turning it on takes under two minutes, with no help.
- A stolen password alone can't sign in to an account with two-step on.

## User flow
1. Folake opens the account menu › **Two-step sign-in** › confirms her password.
2. She scans the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), or types the key shown under it, and enters the 6-digit code to confirm.
3. Vento shows 10 backup codes to save (copy or download), each usable once if her phone is lost.
4. Next time she signs in on a new computer, after her password Vento asks for the code, with "Don't ask again on this computer for 30 days".

## Acceptance criteria

### Main path
- Anyone with a password can turn two-step sign-in on or off; both need the password.
- Set-up shows a QR code and the key as text, and isn't finished until a correct code is entered.
- After a correct password, accounts with two-step get the code screen; a correct code (or an unused backup code) signs in.
- "Don't ask again on this computer for 30 days" skips the code on that browser for 30 days.
- Owners and group admins without two-step see "Protect your account with two-step sign-in" on Home, with **Turn on**; it can be dismissed for this browser.
- Members and roles shows who has two-step on.
- Sign-in keeps where you were going: an invite link or page opened while signed out returns there after sign-in, including after the code.

### Organization isolation
- Two-step belongs to the person, not a group. Its audit events go to every group the person belongs to.

### Property scoping
Not relevant.

### Permissions, limits and approvals
- Only the person can turn their own two-step on or off.
- Five wrong codes lock code entry for 15 minutes.
- PIN sign-in on shared devices is unchanged (the device is the second factor, decision 0022).

### Audit events
- `two_step.turned_on`, `two_step.turned_off`, in every group the person belongs to (actor: the person), only for a real change.
- Turning it on signs the person out everywhere else; turning it off forgets every trusted computer. A PIN session on a shared device can't use any two-step endpoint.

### Leakage exceptions, offline behaviour, business date, tax lines, foreign currency, availability locking
Not relevant.

### Empty, error and edge cases
- Wrong code: "That code didn't work. Codes change every 30 seconds; try the newest one."
- Lost phone: sign in with a backup code, then turn two-step off and on again with the new phone. No backup codes left: an owner can't reset someone else's two-step yet (open question below).

## Behind the scenes
- Better Auth's two-factor plugin (TOTP, backup codes, trusted devices); its `two_factors` table and `users.two_factor_enabled`.
- The QR code is drawn in the browser, from a small library loaded only when the set-up dialog opens.

## UI copy
"Two-step sign-in", "Protect your account with two-step sign-in", "Enter your code", "From your authenticator app", "Don't ask again on this computer for 30 days", "Use a backup code instead", "Save your backup codes".

## Out of scope
Codes by SMS or WhatsApp (provider is an open question), requiring two-step for a role or group (open question), an owner resetting someone else's two-step, passkeys, and manager approval by PIN (moves to Stage 1 with the first action that needs it).

## Open questions
- Should a group be able to require two-step sign-in for owners and managers? (Decide with pilot hotels.)
- Who restores access for someone who lost their phone and backup codes? (Today: they reset by turning it off from a signed-in session; an owner reset is not built.)
