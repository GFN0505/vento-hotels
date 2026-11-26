# Feature switches: build ahead, release per group

- **Status:** built (brick 9)
- **Stage:** 0
- **Module:** Platform
- **Walkthroughs:** `going-live.md` (a pilot group gets front desk switched on first)
- **Screens:** none for hotels. Switched-off modules simply aren't there.
- **Decisions:** `docs/decisions/0021-feature-switches.md`

## Problem
We want to build modules ahead of releasing them, release to a pilot hotel group first, and later sell modules separately. Today, everything merged is live for everyone.

## Persona and job
- **Vento team** (rarely, at a terminal): switch a module on for a pilot group, or off for a group that hasn't bought it, with a reason.
- **Hotel staff:** never see a module their group doesn't have; no dead links.

## Success looks like
- A module can be merged and stay invisible until it's switched on, proven by tests on the API and in the app.
- Switching is one command and leaves an audit trail.

## Acceptance criteria

### Main path
- The catalog lists the ten modules, all unreleased for now.
- `pnpm features list <group>` shows each feature's state for a group and why (released, switched on, switched off). `pnpm features on|off <group> <feature> --reason "…"` changes it; `pnpm features reset <group> <feature> --reason "…"` goes back to the catalog.
- `organization.current` returns the features that are on for the caller's group.
- A procedure gated by `requireFeature` answers 403 with `code: FEATURE_OFF` when the feature is off, before any permission check reveals more.
- The web app hides nav entries and settings sections for switched-off features, and a route behind a switched-off feature shows "This isn't switched on for your group".

### Organization isolation
- A switch applies to one group only. Another group's features are never read or changed.

### Property scoping
Not relevant: features are per group.

### Permissions, limits and approvals
- Feature switches come before permissions: a module that's off is off for everyone, owners included.
- Hotels can't switch features: there's no API for it.

### Audit events
- `feature.switched_on`, `feature.switched_off` and `feature.reset`, with the feature, before and after, and the reason. Actor "Vento team".

### Leakage exceptions, offline behaviour, business date, tax lines, foreign currency, availability locking
Not relevant. (Offline devices get the feature list with the rest of the session data when the offline shell lands.)

### Empty, error and edge cases
- Unknown group or feature: the command says so and changes nothing.
- A reason is required for on, off and reset.
- A feature whose module is off is off, whatever its own switch says.

## Behind the scenes
- Table `organization_features (organization_id, feature, enabled, reason)`, unique per group and feature.
- `VENTO_ALL_FEATURES=true` in development and browser tests turns everything on.

## UI copy
"This isn't switched on for your group. Ask Vento if you'd like to use it."

## Out of scope
A support console screen for switches (Stage 6), billing tied to modules (Stage 6), per-property switches, and percentage rollouts.

## Open questions
None.
