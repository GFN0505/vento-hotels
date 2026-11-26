# Shared devices and staff PIN sign-in

- **Status:** built (brick 10, in review)
- **Stage:** 0
- **Module:** Platform
- **Walkthroughs:** `going-live.md` (Tunde registers the devices; staff set PINs), `restaurant-power-cut.md` and `room-attendant-shift.md` (staff switch on a shared tablet or phone)
- **Screens:** Devices (#25, `SetDevices.dc.html`, `Devices*.dc.html`), Device not registered (#24, `AuthDevice.dc.html`), lock screens (#22, `LockPOS*.dc.html`, `LockHK*.dc.html`)
- **Decisions:** `docs/decisions/0008-permission-limits-approvals-audit.md`, `docs/decisions/0022-shared-devices-and-pin.md`

## Problem
A restaurant tablet, a front desk PC or a housekeeping phone is used by many people in one shift. Typing an email and password every time is too slow, so staff share one login, and then nobody knows who voided what. Each person needs their own quick way in, and the device must lock itself when they walk away.

## Persona and job
- **GM or owner** (once per device, a minute each): register the tablet to the hotel and give it a name and purpose; revoke it if it's lost.
- **Waiter, cashier, room attendant, front desk** (dozens of times a shift): tap their name, enter a 4-digit PIN, work, walk away.
- **Every member** (once): set their own PIN.

## Success looks like
- Switching person on a shared device takes one tap and four digits, under 3 seconds.
- Every action on a shared device is recorded against the person who did it and the device.
- A lost tablet is useless once revoked.

## User flow
1. Tunde (GM) signs in on the Calabash tablet with his email, opens Settings › Devices › **Register this device**, names it "POS-VI-03", picks Kora Victoria Island and "Restaurant & bar tablet", then **Lock this device**.
2. The tablet now shows the lock screen: hotel, device name, time, and the people who work at Kora Victoria Island and have a PIN.
3. Musa taps his name, enters his PIN, and is in. After 90 seconds without a touch, the tablet signs him out and shows "Musa was signed out".
4. Musa set his PIN once from the account menu (Set staff PIN, confirmed with his password). If he forgets it, a manager resets it from Members and he sets a new one.
5. The tablet is stolen: Tunde revokes it with a reason. It's signed out at once and its lock screen stops working.

## Acceptance criteria

### Main path
- Registering a device needs `setup.manage` and gives: name (unique in the group), hotel (one the registering person can see), purpose (front desk PC, restaurant & bar tablet, housekeeping phone). The browser keeps a long-lived, httpOnly device cookie holding a random secret; only its hash is stored.
- The lock screen lists members who can see the device's hotel and have set a PIN, as first name and initial with their role.
- PINs are exactly 4 digits. Obvious ones (all the same digit, 1234, 4321 and similar runs) are refused. They're stored hashed.
- Signing in with a PIN creates a session for that person, bound to the device: it sees only the device's hotel, whatever the person's wider access, and it can't manage people, permissions or devices (that needs a password sign-in).
- Idle sign-out: front desk PC 5 minutes, restaurant & bar tablet 90 seconds, housekeeping phone 5 minutes. A "Lock" button in the top bar signs out at once.
- Devices list: name, purpose, hotel, last seen, status; rename; revoke with a required reason. Revoking ends every session on the device.
- Signed-out visitors to the app on a registered device go to the lock screen, not the email sign-in. The lock screen offers "Sign in with email instead".

### Organization isolation
- Devices, PINs and lock-screen lists belong to one group. A device cookie only ever shows its own group's people.

### Property scoping
- A device belongs to one hotel. Only people who can see that hotel appear on it, and their PIN session is limited to it.
- Managers register devices only for hotels they can see.

### Permissions, limits and approvals
- Register, rename, revoke and reset a PIN: `setup.manage`.
- Setting your own PIN needs your password, even when signed in.
- Five wrong PINs in a row lock that person's PIN for 15 minutes; after three lockouts without a successful sign-in, only a manager's reset unlocks it. Each device allows at most 30 PIN attempts per 10 minutes.
- The server enforces PIN sessions too: they end after the device's idle time without a request (plus 30 seconds), after 12 hours, if the device is revoked or its hotel archived, and they only work alongside their device's cookie. They can't change the account (name, password, sessions).
- Setting your PIN allows 5 password tries per 10 minutes. Resetting someone's PIN follows the same reach as managing them, and ends their PIN sessions.
- Manager approval by PIN (above a limit) and two-step codes for managers come in brick 11.

### Audit events
- `device.registered`, `device.renamed`, `device.revoked` (with reason), `pin.set`, `pin.reset`, `member.signed_in_with_pin` (device), `pin.locked` (after five wrong tries, with the device and whether a reset is now needed). Events made in a PIN session carry the device id.

### Leakage exceptions
- PIN sessions make every later exception (void, discount, comp) attributable to a person and device. Reports come in Stage 1.

### Offline behaviour
- Not in this brick: the lock screen needs a connection. Signing in with PINs saved on the device while offline comes with the offline shell (brick 12).

### Business date, tax lines, foreign currency, availability locking
Not relevant.

### Empty, error and edge cases
- Device not registered: "This device isn't registered" with "Sign in with email instead".
- Nobody with a PIN yet: "Nobody can sign in here yet. Staff set a PIN from their account menu."
- Wrong PIN: "Wrong PIN. 3 tries left." Locked: "Too many wrong PINs. Try again at 20:07, or ask a manager to reset your PIN."
- Revoked device: its lock screen says "This device was removed from Kora Hotels Group".

## Behind the scenes
- Tables `devices` and `member_pins`; `sessions.device_id`.
- PIN sign-in is a Better Auth endpoint (`/api/auth/device/pin-sign-in`), so sessions and cookies work exactly like password sign-in.

## UI copy
"Tap your name", "Enter your PIN", "Musa was signed out", "Register this device", "Lock this device", "Set staff PIN", "Reset PIN".

## Out of scope
Manager approval by PIN and the approvals inbox, two-step codes (brick 11), offline PIN sign-in (brick 12), PIN-only staff without an email (HR, Stage 5), kitchen display screens, and showing open checks on the lock screen (Stage 3).

## Open questions
None.
