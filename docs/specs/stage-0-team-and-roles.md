# Team: invites, members and roles, permissions and limits

- **Status:** built (brick 8, in review)
- **Stage:** 0
- **Module:** Platform
- **Walkthroughs:** `going-live.md` (the owner invites the GM and front desk), `front-desk-morning.md` step 1 (a member limited to Kora Victoria Island)
- **Screens:** Members and roles (#25, `SetMembers.dc.html`, `SetInvite.dc.html`), accept invite (#24, `AuthInvite.dc.html`), Permissions and limits (#26, `PermGrid.dc.html`, `PermRoleM.dc.html`)
- **Decisions:** `docs/decisions/0017-sign-in-and-tenancy.md`, `docs/decisions/0018-permissions-and-audit-in-practice.md`, `docs/decisions/0020-invitations.md`

## Problem
A group set up in Vento has one person in it: the owner. Before any front desk work can happen, the owner has to bring in their GM, front desk and finance people, decide which hotels each one sees, and be able to see and adjust what each role may do. The rules exist on the server (brick 6); nobody can see or use them yet.

## Persona and job
- **Owner or group admin** (laptop, during setup and when staff join or leave): invite people, set their role and hotels, change or remove them.
- **Owner** (rarely): look at the permissions matrix and change a role's rule or limit, with a reason.
- **New staff member** (phone, from the invite email): join in under a minute without a second confirmation email.

## Success looks like
- Inviting a person takes one dialog: email, role, hotels, Send.
- Joining from the email takes one screen: name, password, Accept.
- Nobody can give themselves more access than they have, demote the last owner, or join with someone else's invite, proven by tests.

## User flow
1. Folake (owner, Kora Hotels Group) opens Settings › Members and roles, clicks **Invite people**.
2. Enters `ada.nwosu@korahotels.ng`, role Front desk, limited to Kora Victoria Island, clicks **Send invite** (3 clicks after typing).
3. Ada gets "Folake Nwosu invited you to Kora Hotels Group". The link opens **Join Kora Hotels Group**: invited as Front desk at Kora Victoria Island, expires 2 Dec. She enters her name and a password, clicks **Accept and continue**, and lands on home seeing only Kora Victoria Island.
4. If Ada already has a Vento account, the page asks for her password instead, then adds her to the group.
5. Folake sees Ada under People. **Edit** changes her role or hotels, or removes her from the group.
6. Folake opens Permissions and limits: the 16 roles × actions grid. She clicks Front desk × Rate override (≤10%), sets 15%, gives a reason, saves. It's in the audit log.

## Acceptance criteria

### Main path
- Invite up to 20 emails at once with one role and one access choice: the whole group, or chosen hotels (at least one). Each gets an email with a link that expires in 7 days.
- Inviting an email that already has a pending invite refreshes it (new link, new expiry, new role and hotels). Inviting someone already in the group is refused for that email with "Already in your group".
- Pending and expired invites show under **Invited** with Resend (new link, 7 more days) and Cancel.
- The join page shows the group, who invited them, their role, their hotels and the expiry. New people set a name and password (same password rule as sign-up). The email is trusted because the link was sent to it: no second confirmation email.
- People with an account sign in on the join page; the invite then adds them. Someone signed in with a different email is told whose invite it is and offered Sign out.
- A used, cancelled or expired link says so and names who to ask.
- Members list: name, email, role, which hotels they see, joined date; search by name or email; filter All, Owners and admins, Managers, Staff. Server-paginated.
- Edit a member: role and hotels in one dialog; Remove from group with a confirmation.
- Permissions and limits: every role × permission with ✓, a limit (≤10%, ≤₦100k) or –, grouped Setup, Front office, Restaurant & bar, Back office. Rules changed from Vento's default are marked. On phones, one role at a time.

### Organization isolation
- Every list, change and invite is inside the caller's organization. Ids from another group answer 404.
- An invite only ever adds the person to the group that sent it.

### Property scoping
- Owners and group admins always see every hotel; their access can't be limited.
- Someone who manages people but is limited to some hotels can only invite to, and grant, those hotels, and can't grant the whole group.

### Permissions, limits and approvals
- Inviting, changing and removing people needs `setup.manage` (owners and group admins by default). Only an owner can invite or make someone an owner or group admin, or change or remove an owner or group admin.
- Except for owners, nobody can invite, change or remove someone in a role that can do more than they can (any permission they lack, or a higher limit), counting the group's own permission changes. So a manager can't create a more powerful second account for themselves.
- Nobody changes their own role or access, or removes themselves, and the last owner can't be stepped down or removed (owner rows are locked, so two owners can't remove each other at once).
- An invite only works while its sender could still give it: if they leave, lose the right to manage people, or can no longer hand out that role or those hotels, the link stops working.
- Replacing a pending invite (inviting the same email again) needs the same rights as resending or cancelling it.
- Viewing the permissions matrix needs `setup.manage` or `permissions.manage`; changing it needs `permissions.manage` (owners) and a reason. The owner role can't be changed.
- Better Auth's organization endpoints are closed over HTTP except create, list and set-active, so every member and invite read or change goes through these rules and the audit log.
- Rate limits: joining 15 and opening invite links 60 per network address per 10 minutes; up to 100 invite emails per person per hour. Passwords are at most 128 characters, and API requests at most 1 MB.

### Audit events
- `member.invited` (email, role, access), `invitation.resent`, `invitation.cancelled`, `member.joined` (actor is the person joining), `invitation.accepted` (someone already in the group used their link), `member.role_changed`, `member.property_access_changed`, `member.removed` (name, email, role), `permission.changed` (existing). All in the same transaction as the change.

### Leakage exceptions
Not relevant.

### Offline behaviour
Settings need a connection. The pages show the usual connection message; nothing is queued.

### Business date
Not relevant.

### Tax lines
Not relevant.

### Foreign currency
Not relevant. Limits in naira.

### Availability locking
Not relevant.

### Empty, error and edge cases
- Only the owner in the group: People shows them, with an "Invite people" prompt.
- An invite link with a token that doesn't exist answers the same as an expired one, so links can't be probed.
- Two people opening the same invite: only the first join wins; the second is told it's been used.

## Behind the scenes
- Invites live in Better Auth's `invitations` table with a `token_hash` (SHA-256 of a 32-byte random token; the token is only in the email), `all_properties`, and `invitation_properties` for chosen hotels.
- Joining creates the user (email verified), the password account, the member, their hotels and the audit event in one transaction; the web app then signs in with the new password.
- `organization.current` returns the caller's allowed permissions so the web app can show Settings only to those who can use it (the server still checks every call).

## UI copy
"Invite people", "Send invite" / "Send 3 invites", "Invites expire in 7 days.", "Join Kora Hotels Group", "Accept and continue", "This invite has expired. Ask Folake Nwosu for a new one.", "Already in your group", "Remove Ada Nwosu from Kora Hotels Group?", "Owners only. Every change is recorded in the audit log."

## Out of scope
PIN-only staff and staff PINs (brick 10, with shared devices), phone number and WhatsApp invites (provider is an open question), two-factor status, limiting people to legal entities, dated rules and effective dates, who approves above a limit (brick 10), exporting the matrix, per-property overrides, and the audit log screen (#28).

## Open questions
None.
