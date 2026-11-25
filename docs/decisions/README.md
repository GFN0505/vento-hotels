# Decision records

Short records of decisions that shape the product or the code, so nobody has to rediscover *why*. One file per decision, numbered, never rewritten: when a decision changes, add a new record that **supersedes** the old one and mark the old one `superseded by NNNN`.

Write one when a choice is hard to reverse, affects several modules, or will make a future reader ask "why did they do it this way?". The architect proposes them in plans; whoever implements the plan commits them in the same pull request.

Status values:
- `proposed`: written down, not yet agreed by the owner.
- `accepted`: agreed and in force.
- `superseded by NNNN`: replaced by a later record; kept for history.

Things still undecided stay under *Open questions* in `docs/DOMAIN.md` until they get a record of their own.

| # | Decision | Status |
|---|---|---|
| [0001](0001-monorepo-and-stack.md) | Monorepo and stack | accepted |
| [0002](0002-nigeria-first-hotel-groups.md) | Nigeria-first hotel groups, ten modules in stages | accepted |
| [0003](0003-organization-property-entity.md) | Organization, property and entity | accepted |
| [0004](0004-money-folios-and-ledger.md) | Money as decimals, append-only folios and ledger | accepted |
| [0005](0005-statutory-rules-as-data.md) | Statutory rules are data with effective dates | accepted |
| [0006](0006-business-date-and-night-audit.md) | Business date moves only at night audit | accepted |
| [0007](0007-availability-locking-and-ota-overbookings.md) | Locked availability; OTA overbookings are accepted and flagged | accepted |
| [0008](0008-permission-limits-approvals-audit.md) | Permission limits, approvals and audit events | accepted |
| [0009](0009-offline-first-operations.md) | Offline-first front desk, POS and housekeeping | accepted |
| [0010](0010-one-channel-manager-provider.md) | One channel-manager provider behind an interface | accepted |
| [0011](0011-infrastructure-choices.md) | Infrastructure: jobs, files, PDFs, providers, observability | accepted |
| [0012](0012-public-repository.md) | The repository is public | accepted |
| [0013](0013-designs-as-source-of-truth.md) | The Claude Design export is the source of truth for UI | accepted |
| [0014](0014-brick-workflow-and-pinning.md) | One branch and pull request per brick; pinned dependencies | accepted |
| [0015](0015-local-services-dont-clash.md) | Local services don't clash with other projects | accepted |
| [0016](0016-local-object-storage.md) | RustFS for local object storage, not MinIO | accepted |
| [0017](0017-sign-in-and-tenancy.md) | Sign-in with Better Auth; property access closed by default | accepted |
| [0018](0018-permissions-and-audit-in-practice.md) | Permissions as data with per-group overrides; audit in the same transaction | accepted |

Template: [0000-template.md](0000-template.md)
