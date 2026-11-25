---
name: nigeria-compliance
description: How Nigerian statutory and regulatory rules are modelled for hotels — VAT, state consumption tax (e.g. Lagos hotel occupancy and restaurant consumption law), service charge, WHT, CIT, PAYE and payroll deductions (pension, NHF, NSITF, ITF), tax lines on postings, guest registration including foreign nationals, hotel licences, NDPA 2023 for guest data, and e-invoicing. Use when building finance, night audit, POS pricing, payroll, check-in or compliance features.
---

# Nigerian compliance

**Rule zero: never hard-code a rate, threshold or deadline.** Statutory values live in a `statutory_rules` configuration table with `code`, `value`, `scope` (`federal`, or a state code such as `LA`), `effectiveFrom`, `effectiveTo`, `source` (act/law/circular and section), `verifiedAt` and `verifiedBy`. Calculations look up the rule effective on the posting's **business date** for the property's state. Any number in seeds or docs is a **default seed value, verify against current law**: a human from finance or legal must confirm it and record the source before go-live.

Nigeria's tax system was reformed by the 2025 tax acts (Nigeria Tax Act, Nigeria Tax Administration Act, Nigeria Revenue Service (Establishment) Act, Joint Revenue Board Act), with effect from 2026, including FIRS being restructured as the Nigeria Revenue Service (NRS). Rates, thresholds, exemptions and levies may have changed. Before seeding or changing any rule, check the current official text: NRS (formerly FIRS), the relevant state internal revenue service (e.g. LIRS for Lagos) and state laws, PenCom, FMBN (NHF), NSITF, ITF, the Nigeria Data Protection Commission (NDPC). Record the source on the rule.

## How taxes reach a folio
- Each menu item, revenue code and rate plan has a **tax category** (e.g. `accommodation`, `food`, `beverage_alcoholic`, `event_hire`, `exempt`). Rules map category × scope → taxes that apply and in what order (some charges may be computed on a base that includes others; that order is configuration too, confirmed against the law).
- When a charge is posted, the service computes **tax lines** (tax code, rate, base, amount, rule id) and stores them on the posting. They are **never recomputed** later; a rate change applies from its effective date forward only. Corrections are reversal postings with their own tax lines.
- **Inclusive / exclusive pricing** is per rate plan and menu. For inclusive prices, back out the taxes from the gross with the decimal library and keep the rounding difference on one explicit line so lines sum to the total.
- Night audit posts room charges and their tax lines per stay per business date.

## Tax
| Tax | Model it as | Notes |
|---|---|---|
| **VAT** | Federal rule (rate, effective dates) + per-entity VAT registration + per-tax-category treatment | Default seed value, verify against current law, including any exemptions for accommodation or food under the 2025 acts. Output VAT reports per entity per period. |
| **State consumption tax** | Rule per state, per tax category, with effective dates | e.g. the Lagos State Hotel Occupancy and Restaurant Consumption Law, administered by LIRS. Each state has its own law, rate, base and remittance body, and some states have none. Rate is a default seed value, verify against current law for that state. Interaction with VAT (whether both apply, on what base) is a legal question to confirm, not to assume. |
| **Service charge** | Per-property setting (rate, which categories, effective dates), not a statutory rule | A hotel charge, not a tax, but shown as a separate line. Whether VAT/consumption tax apply to it is configuration confirmed by finance. If shared with staff, it feeds the payroll service charge distribution. |
| **WHT** | Rate rules per payment category (contracts, supplies, professional fees, rent, commissions) and payee type (company/individual, resident/non-resident) | Deducted on payments to suppliers and possibly on OTA/travel agent commissions (verify). Generate WHT credit notes; track remittance to the right authority (NRS or state). |
| **CIT and levies** | Computed in reporting from the ledger, rules by company size | Don't build a tax filing engine. Produce the schedules accountants need per entity. Thresholds and levies changed under the 2025 acts; verify. |
| **PAYE** | Bands, reliefs and exemptions as versioned rules, by employee's state of residence | Remitted to the employee's state IRS. Default seed values, verify against the current Nigeria Tax Act schedule. |

## Payroll deductions
Model each as a pay rule with base (basic, basic+housing+transport, gross), employee %, employer %, caps, and effective dates:
- **Pension (PenCom, Contributory Pension Scheme):** employee and employer contributions on the pensionable base, remitted to each employee's PFA. The 8% / 10% in `docs/DOMAIN.md` are default seed values, verify against current law.
- **NHF:** employee contribution on basic salary, remitted to FMBN.
- **NSITF:** employer contribution on payroll (Employees' Compensation Act).
- **ITF:** employer contribution on payroll for qualifying employers (threshold is a rule).
- **Casual staff:** daily-rate workers still fall under PAYE rules; whether pension and others apply depends on engagement terms, so make it per-employee configuration.
- **Service charge distribution:** points or equal shares per eligible employee; taxable flag from configuration.

Payroll runs are draft → reviewed → approved → paid, per entity; approved runs are locked and corrections go to the next run. Remittance schedules (PAYE per state, pension per PFA, NHF, NSITF, ITF) are generated as files/reports; filing happens outside the app.

## Guest registration
- Every checked-in guest has a **guest registration record**: full name, nationality, address, phone, ID type and number (encrypted at rest, masked in the UI), arrival date, departure date, room, signature or acknowledgement.
- **Foreign nationals:** passport number, nationality, issuing country, visa/residence permit type and number, date and port of entry where required, arriving from and next destination. Required fields are configuration per state, since the exact requirements and who may request the register (police, immigration, state tourism body) need confirming.
- The register is exportable per property and date range for authorities on request; every export is logged (who, when, why).
- Pre-check-in in the guest app can collect these, with ID upload; the front desk confirms at arrival.

## Licences and permits
Per property: state tourism registration/classification, NIHOTOUR registration (National Institute for Hospitality and Tourism), liquor licence, fire safety certificate, environmental health / food handling permits, signage permits, and others. Each record has type, issuing authority, number, issue and expiry dates, renewal fee, documents, and alerts at configurable intervals before expiry. Names, authorities and requirements vary by state, so the licence type list is configuration per state; don't hard-code a list as complete.

## E-invoicing and fiscalisation
The 2025 reforms and NRS (formerly FIRS) have introduced or announced electronic invoicing / fiscalisation requirements (e.g. the FIRS e-invoicing system, MBS). Scope, which taxpayers it covers, start dates and technical integration (APIs, invoice IDs, QR codes) are **to verify** against current NRS guidance before building. Until confirmed: keep invoices immutable once issued, number them sequentially per entity with no gaps, store issuer and buyer TINs, and design invoice issuing behind an interface so a fiscal provider can be added. Tracked in `docs/DOMAIN.md` open questions.

## Data protection (NDPA 2023)
- Collect only what each feature needs. Never store BVN. Card data never touches our servers (provider tokens only).
- ID and passport numbers and scans are encrypted at rest, masked in the UI, and visible in full only with a specific permission; access is logged.
- Lawful basis per purpose: legal obligation for the guest register, contract for the stay, consent for marketing (separate from transactional messages like confirmations and pre-arrival).
- Export a guest's data on request; delete or anonymise when there's no legal reason to keep it (guest register, tax and accounting records have retention duties: periods are configuration, verify against current law).
- Personal data never appears in logs, analytics events or error reports.
- Processors (channel manager, Paystack, WhatsApp/SMS provider, hosting) are listed with what data they receive. Cross-border transfers (e.g. OTA data) follow NDPC guidance.
- Breach response: record incidents and notify per the NDPA's time limits (verify current NDPC guidance).

## When unsure
Model the rule as configuration, leave the value for finance or legal to confirm, and list it in the feature's open questions. Never guess a statutory number and never present a seed value as settled law.
