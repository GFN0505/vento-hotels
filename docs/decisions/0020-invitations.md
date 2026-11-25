# 0020 · Invitations are Vento's, with a secret link that also confirms the email

- **Date:** 2026-11-26
- **Status:** accepted

## Context
Owners bring staff into their group by invitation (design #25 and #24, "Join Kora Hotels Group"). Better Auth's organization plugin has invitations, but they carry only a role, use the invitation's id as the link, write audit events without saying who acted, and let a new person join only after signing up and confirming their email in a second email. Hotels need each invite to carry the hotels the person may see, every change to say who made it, and joining to take one screen on a phone.

## Decision
- Vento's API creates, resends, cancels and accepts invitations (`invitations.*`), and changes or removes members (`members.update`, `members.remove`), under the permissions matrix, writing audit events with the actor in the same transaction.
- Invitations stay in Better Auth's `invitations` table, extended with `token_hash`, `all_properties` and an `invitation_properties` table.
- The link carries a 32-byte random token. Only its SHA-256 hash is stored, so a database leak doesn't reveal working links. Ids (UUID v7) are never used as secrets.
- Opening the link proves the person can read that inbox, so joining marks the email verified: one screen (name, password), no second email. The user, password account, member, hotels and audit event are created in one transaction; the web app then signs in normally.
- Better Auth's organization endpoints are refused over HTTP except create, list and set-active (an allowlist, so new Better Auth endpoints start closed). There is one path, with one set of rules.
- An invite carries its sender's authority: when it's opened or used, Vento checks the sender could still give that role and those hotels today.

## Consequences
- Anyone holding a live invite link can join as that email, so links expire in 7 days, are single-use, and can be cancelled. Emails are the only channel until a WhatsApp provider is chosen.
- Vento owns password hashing for joiners, using Better Auth's own `hashPassword`, so sign-in works the same for everyone.
- If Better Auth adds invitation features, we don't get them for free.

## Alternatives considered
- **Better Auth's invitations as they are:** no hotels on the invite, no actor in the audit log, and a two-email join.
- **The invitation id as the link:** UUID v7 is partly a timestamp, and the id would be stored in clear.
