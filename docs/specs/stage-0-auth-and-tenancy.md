# Sign-in, organizations, properties and entities

- **Status:** built (brick 5, in review)
- **Stage:** 0
- **Module:** Platform
- **Walkthroughs:** `going-live.md` steps 1–3 (owner creates the organization, entity and property), `front-desk-morning.md` step 1 (property-limited member)
- **Screens:** Sign in and access states (#24, API only in this brick), Settings: properties, entities, members (#25, API only), Onboarding (#19, API only)
- **Decisions:** `docs/decisions/0003-organization-property-entity.md`, `docs/decisions/0017-sign-in-and-tenancy.md`

## Problem
Nothing in Vento can be built safely until we know who is asking, which hotel group they belong to and which hotels they may see. Every later table hangs off this.

## Persona and job
The owner sets up the group (Kora Hotels Group), its legal company (Kora Hospitality Ltd) and its hotels. Staff sign in and only ever see their group, and only the hotels they're assigned to.

## Success looks like
- A person can sign up, verify their email, sign in, create an organization, add an entity and a property, in a handful of API calls (the onboarding screen in brick 7 wraps them).
- No request can read or change another organization's data, and a property-limited member can't reach other properties, proven by tests.

## User flow (API in this brick, screens in brick 7)
1. Sign up with name, email and password (`/api/auth/sign-up/email`). A verification email is sent (logged to the console locally).
2. Verify the email, then sign in (`/api/auth/sign-in/email`). A session cookie is set.
3. Create the organization (`/api/auth/organization/create`), which becomes the active organization. The creator is its `owner` with access to all properties.
4. Create an entity (`entities.create`), then a property owned by it (`properties.create`).
5. Give another member access to specific properties, or to all of them (`members.setPropertyAccess`).

## Acceptance criteria

### Main path
- Given a verified user with an active organization, when they list properties, then they get the shared page shape with only that organization's properties they may access.
- Given an unverified email, sign-in is refused with a message to verify first.
- A new password must have at least 8 characters, a capital letter, a small letter, a number and a special character. Sign-up and reset show a live checklist; the API refuses anything weaker with `PASSWORD_TOO_WEAK`.

### Organization isolation
- `organizationId` always comes from the session's active organization, never from input.
- A member of Kora can't list, read or create in another organization, even with a guessed id: reads answer **404**, not 403, so they don't reveal that the record exists.
- Creating a property with an entity from another organization is refused.

### Property scoping
- A member's access is **closed by default**: they see no properties until given all properties or a list. Owners get all properties.
- A member limited to Kora Victoria Island doesn't see Kora Abuja in lists, and gets 404 when asking for it by id.

### Permissions, limits and approvals
- Until the permissions matrix lands (brick 6), only `owner` and `group_admin` may create entities and properties or change property access. Everyone else gets 403.
- No limits or approvals in this brick.

### Audit events
Not in this brick. Audit events arrive in brick 6, which will add them to these procedures.

### Leakage exceptions, offline behaviour, tax lines, foreign currency, availability locking
Not relevant.

### Business date
- A new property's business date starts at today's date in its time zone (default `Africa/Lagos`). Only night audit moves it after that.

### Empty, error and edge cases
- No session: 401. A session without an active organization: 403 "Choose an organization first".
- Duplicate property or entity name within an organization: refused with a clear message.
- Archived properties are hidden from lists.

## Behind the scenes
- Better Auth owns users, sessions, accounts, verifications, organizations, members and invitations. Vento owns entities, properties and member property access.
- Ids are UUID v7 everywhere, including Better Auth's tables.
- Emails go through an `EmailProvider`. Locally it prints to the console, and tests capture it.

## UI copy
Errors: "Sign in to continue", "Choose an organization first", "You don't have access to this", "A property with this name already exists".

## Out of scope
Two-factor sign-in (brick 12), the permissions matrix and audit events (brick 6), screens (brick 7), social sign-in, SSO.

## Open questions
None.
