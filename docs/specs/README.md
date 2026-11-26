# Feature specs

One file per feature, written by the **product-manager** agent before the architect plans it. Copy [`_template.md`](_template.md) to `docs/specs/stage-<n>-<slug>.md`, where `<n>` is the stage from the release plan in `docs/PRODUCT.md` (e.g. `stage-1-check-in.md`, `stage-3-post-to-room.md`).

## How a spec is written
- **Start from the walkthroughs.** Every spec names the journeys in `docs/journeys/` it adds or changes, and the steps it makes work. If no walkthrough covers the feature, write or extend one first.
- **Use the designs.** List the screens with their design numbers from `docs/design/screen-inventory.md`. The boards in `docs/design/export/` are the source of truth for layout and copy.
- **Use the domain words.** Terms, statuses, permissions and limits come from `docs/DOMAIN.md`. A new term goes into DOMAIN.md in the same change.
- **Stay inside the module.** Each spec belongs to one of the ten modules (or Platform). Anything outside it needs the owner's agreement.
- **Cover the hotel rules.** The template's acceptance criteria list the checks every spec must answer: organization isolation, property scoping, permission limits and approvals, audit events, leakage exceptions, offline behaviour, business date, tax lines, foreign currency and availability locking. Write "not relevant" rather than leaving one out.
- **Small.** One spec should fit in one or two pull requests. Split anything bigger.

## Status
`draft` → `approved` → `built`

- **draft:** the product-manager is writing it. Open questions are allowed.
- **approved:** the owner has read it and agreed. Open questions are answered. Nothing is built until a spec is approved.
- **built:** shipped, with the journey, screen inventory, help article and changelog updated in the same change (see the definition of done in `docs/README.md`).

A spec that is dropped is deleted, with the reason in the commit message.

## Specs
| Spec | Stage | Module | Journeys | Status |
|---|---|---|---|---|
| [Sign-in, organizations, properties and entities](stage-0-auth-and-tenancy.md) | 0 | Platform | going-live, front-desk-morning | built |
| [Permissions, limits and the audit log](stage-0-permissions-and-audit.md) | 0 | Platform | front-desk-morning, owner-morning, going-live | built |
| [Team: invites, members and roles, permissions and limits](stage-0-team-and-roles.md) | 0 | Platform | going-live, front-desk-morning | built |
| [Feature switches: build ahead, release per group](stage-0-feature-switches.md) | 0 | Platform | going-live | built |
| [Shared devices and staff PIN sign-in](stage-0-devices-and-pin.md) | 0 | Platform | going-live, waiter-dinner-service, room-attendant-shift | built |
| [Two-step sign-in](stage-0-two-step-sign-in.md) | 0 | Platform | going-live, owner-morning | built |
| [Role-shaped Home and All hotels](stage-0-role-homes.md) | 0 | Platform | owner-morning, front-desk-morning, room-attendant-shift | built |
| [Offline shell](stage-0-offline-shell.md) | 0 | Platform | waiter-dinner-service, front-desk-morning | built |
| [Stage 1 plan: front office bricks](stage-1-plan.md) | 1 | Reservations & Front Desk, Finance | all Stage 1 journeys | approved |
| [Room types and rooms](stage-1-room-types-and-rooms.md) | 1 | Reservations & Front Desk | going-live | approved |
| [Hotels and companies](stage-1-hotels-and-companies.md) | 1 | Platform | going-live | approved |
| [The hotel switch scopes every page](stage-1-hotel-switch-scope.md) | 1 | Platform | owner-morning, going-live | approved (owner, 2026-11-26, for the agreed rule) |
| [Taxes, service charge, payment methods and FX rates](stage-1-taxes-and-payment-methods.md) | 1 | Finance | going-live, front-desk-morning, night-audit | approved |
