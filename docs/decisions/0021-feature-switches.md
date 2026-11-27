# 0021 · Modules and features ship behind switches

- **Date:** 2026-11-26
- **Status:** accepted; the "Who switches" bullet (command only, support console in Stage 6) is superseded by 0027

## Context
Everything merged into `main` ships. The owner wants to build ahead and release when ready: an MVP first, then modules one by one, first to a pilot hotel group and then to everyone. Pricing per module is also an open question (`docs/DOMAIN.md`), so a group may not have bought a module at all. Hiding a menu entry isn't enough: the API must refuse a switched-off module too.

## Decision
- **One catalog in code:** `packages/shared/src/features.ts` lists every switchable module or feature (`front_desk`, `restaurant_pos`…), with a label and whether it's **released** to everyone. A feature can belong to a module and is only on when its module is.
- **Per-group switches in the database:** `organization_features` overrides the catalog for one group (on for a pilot, or off for a group that hasn't bought it), with a reason.
- **Effective rule:** a group's switch if it has one, otherwise the catalog's `released`.
- **Who switches:** the Vento team, never the hotel, using `pnpm features` (a command run against the database with access to it). Every switch writes an audit event in the group's log (actor "Vento team"). A support console screen can come later (Stage 6) on the same table.
- **Server:** `access.features` is loaded with the permissions on every request. Module procedures go through `requireFeature`, which refuses with "This isn't switched on for your group" (`FEATURE_OFF`).
- **Web:** `organization.current` returns the group's features. The sidebar, settings and links show only switched-on modules, and a route for a switched-off module shows a plain "not switched on" state.
- **Development and tests:** `VENTO_ALL_FEATURES=true` turns every feature on locally and in browser tests, so unreleased work can be built and tried. It is never set in production.
- Setup, team, permissions and the audit log are the platform, not features. They're always on.

## Consequences
- Every new module starts as an unreleased catalog entry, and its router and nav entry are gated from the first commit (`add-module` skill).
- Releasing to everyone is a one-line change (`released: true`) in a reviewed pull request. Releasing to a pilot is a command with a reason, recorded in that group's audit log.
- Turning a module off hides it and refuses its API calls; it never deletes data.

## Alternatives considered
- **Long-lived branches per module:** they drift from `main`, and merges get painful.
- **A third-party flag service:** another vendor, another outage path and data leaving the country, for something a table does.
- **Environment variables per feature:** all-or-nothing per deploy, with no pilot group.
