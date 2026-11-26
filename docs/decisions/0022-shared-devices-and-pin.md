# 0022 · Shared devices are registered, and staff sign in on them with a PIN

- **Date:** 2026-11-26
- **Status:** accepted

## Context
Hotels run on shared tablets, PCs and phones. Email and password every switch is too slow, so staff share logins, and leakage becomes untraceable. Decision 0008 calls for PIN sign-in on shared devices and full sign-in elsewhere.

## Decision
- **A device is registered** by a manager to one hotel. The browser keeps an httpOnly cookie with a 32-byte random secret, and only its hash is stored. Revoking a device ends its sessions and makes the cookie worthless.
- **PINs are 4 digits**, hashed like passwords, set by the person themselves after confirming their password. Obvious PINs are refused. Five wrong tries lock that PIN for 15 minutes; each device also has an attempt limit.
- **PIN sign-in is a Better Auth endpoint**, so a PIN session is an ordinary session with the same cookie handling, plus `device_id`.
- **A PIN session is narrower than the person:** it sees only the device's hotel, and it can't manage people, permissions or devices. Those need a password sign-in on a personal device.
- **Idle sign-out** by device purpose (90 seconds on restaurant tablets, 5 minutes elsewhere) happens in the app, with a 10-second warning, and on the server, which ends a PIN session after the idle time without a request, after 12 hours, or when it's used without its device's cookie. A Lock button is always there.
- **Lockouts escalate:** five wrong PINs lock for 15 minutes; three lockouts in a row need a manager's reset.

## Consequences
- Every action on a shared device carries the person and the device in the audit log.
- 4 digits is a small space. It's safe only because the device must be registered (a secret cookie), attempts are limited per person and per device, and PIN sessions are confined to one hotel. Don't relax any of the three without revisiting this decision.
- Offline PIN sign-in (brick 12) will need PIN verifiers cached on the device; that design comes with the offline shell.

## Alternatives considered
- **Shared logins per device:** what hotels do today, and why leakage can't be traced.
- **Password on every switch:** too slow at a busy bar.
- **Card or fingerprint readers:** hardware hotels don't have yet. Can come later behind the same device session.
