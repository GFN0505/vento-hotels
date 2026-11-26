# Documentation map

Everything about Vento Hotels that isn't code lives in `docs/`. If you're new, read in this order: **PRODUCT → DOMAIN → journeys/00-golden-thread → design/screen-inventory**.

| Document | What it answers | Owner (agent) | Update when |
|---|---|---|---|
| [PRODUCT.md](PRODUCT.md) | What we're building, for whom, the ten modules, the release plan by stage | product-manager | Scope or stages change (owner approves) |
| [DOMAIN.md](DOMAIN.md) | Vocabulary, statuses, permissions matrix and limits, business rules, open questions | product-manager, architect | A new term, status, rule or limit appears |
| [journeys/](journeys/README.md) | Step-by-step walkthroughs on the demo hotel group, starting with [00-golden-thread](journeys/00-golden-thread.md); each becomes an e2e test and a help article | product-manager (writes), tester (tests) | A flow is added or changes |
| [specs/](specs/README.md) | One spec per feature, per stage: problem, flow, acceptance criteria | product-manager | Before building any feature |
| [research/](research/role-homes.md) | Research that feeds later work, e.g. what each role's Home should show at a glance | product-manager, ui-designer | Before a large UX build; refresh when it's used |
| [decisions/](decisions/README.md) | Why the big choices were made | architect proposes, implementer commits | A hard-to-reverse or cross-module choice |
| [design/export/](design/export/README.md) | The approved designs from Claude Design: source of truth for the UI | (exported, never hand-edited) | A new design round is exported |
| [design/screen-inventory.md](design/screen-inventory.md) | Every screen, its design number, stage and build status | product-manager, frontend | A screen is added, designed, built or changed |
| [design/CHANGES.md](design/CHANGES.md) | Where a build deliberately differs from its design | frontend | A designed screen is built differently |
| [design/claude-design-prompt.md](design/claude-design-prompt.md), [design/claude-design-update-prompt.md](design/claude-design-update-prompt.md) | The Claude Design prompts that produced the designs | product-manager, ui-designer | A new design round |
| [help/](help/README.md) | Customer help-centre articles, including guest app articles | frontend (writes), ui-designer (reviews copy) | A journey ships |
| [UX-STANDARD.md](UX-STANDARD.md) | The UX bar every screen must clear before the owner sees it, and how it's enforced | ui-designer (reviews), frontend (builds to it) | The bar rises, or a gate is added |
| [marketing/](marketing/README.md) | Approved brand and marketing copy: headline, taglines, boilerplate, website and outreach pieces | brand-marketing (owner approves) | Positioning changes, or a new public piece |
| [../CHANGELOG.md](../CHANGELOG.md) | What changed, release by release, in customers' words | whoever ships | Every user-visible change |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the code is laid out, a request end to end, offline path, data, jobs, build and quality gates | architect | Structure changes |
| `RUNBOOK.md` *(before first deploy)* | Environments, deploys, backups and restores, night audit and job failures, incident steps | devops | Infrastructure changes |
| [../.env.example](../.env.example) *(arrives with brick 1)* | Every environment variable and what it's for | backend, devops | A variable is added |

Specialists keep their parts of these documents true: **payments** (folios, deposits, settlements, refunds), **finance** (night audit, ledger, tax, payroll, reports), **distribution** (booking engine, channel manager, rates), **security** (audits before releases), **reviewer** (checks the definition of done below on every change).

## Definition of done (documentation)
A change isn't done until, in the same commit:
1. The **journey** matches what was built and its e2e test passes (the steps for this stage are no longer `test.fixme`).
2. **design/screen-inventory.md** status is updated; any departure from a design is in **design/CHANGES.md**.
3. New terms, statuses, rules or permission limits are in **DOMAIN.md**.
4. A **decision record** exists for any hard-to-reverse or cross-module choice.
5. A **help article** exists for any shipped journey.
6. **CHANGELOG.md** has a line for any user-visible change.
7. New environment variables are in **.env.example**.
8. The **walkthrough demo world** (names, rooms, rates, amounts in `journeys/README.md` and the seed) still matches the designs in `design/export/`. When they disagree, change the walkthroughs and seed, not the designs.
