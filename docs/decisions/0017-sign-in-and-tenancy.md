# 0017 · Sign-in with Better Auth; property access closed by default

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Stage 0, brick 5 needs sign-in, organizations (hotel groups), and a way to limit members to some properties (decision 0003). Every later table hangs off this, so the security defaults matter more than the features.

## Decision
- **Better Auth** owns users, sessions, accounts, verifications, organizations, members and invitations, through its Drizzle adapter on our own tables (plural names, UUID v7 ids from `newId()`).
- **Email and password** sign-in with **verified emails required** and the password rule from `@vento/shared` (owner's decision, 25 Nov 2026, replacing an earlier 10-character minimum): at least 8 characters with a capital letter, a small letter, a number and a special character. The API enforces it on sign-up, reset and change, whatever the screen allowed. Two-factor sign-in comes in brick 8, alongside PIN sign-in on shared devices.
- The organization plugin uses our 16 hotel roles. For Better Auth's own organization management (invite, remove, change role), `owner` and `group_admin` are admins and every other role is a plain member. What each role may do in Vento comes from the permissions matrix (brick 6).
- **Vento owns** `entities`, `properties` and `member_properties`.
- **Property access is closed by default.** A member sees no properties until given all of them or a list. Owners and group admins always see all.
- **`organizationId` comes only from the session's active organization**, never from input. Reads outside the caller's scope answer **404**, not 403, so they don't reveal that a record exists.
- Emails go through `EmailProvider`. Locally it's the console and in tests it's a memory capture, until a provider is chosen.

## Consequences
- Every procedure that reads operational data goes through `inOrganization` and scopes with `propertyScope()` (`apps/api/src/tenancy/access.ts`). New modules reuse these helpers instead of writing their own.
- Each module's tests include organization-isolation and property-scoping cases, like `tenancy.test.ts`.
- Upgrading Better Auth means checking its required fields (`getAuthTables()` from `better-auth/db`) against `db/schema/auth.ts`.
- `BETTER_AUTH_SECRET` must be set in every environment. Rotating it signs everyone out.

## Alternatives considered
- **Building our own auth:** more to secure and maintain, for no product gain.
- **Clerk, Auth0 or other hosted auth:** extra cost per user, data held outside our database, and a harder offline/PIN story.
- **Open-by-default property access:** one forgotten assignment would expose every hotel. Rejected.
- **403 for out-of-scope reads:** reveals which ids exist in other groups. Rejected.
