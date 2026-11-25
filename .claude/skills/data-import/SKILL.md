---
name: data-import
description: How customers move onto Vento from another PMS or Excel — the import job lifecycle (uploaded → validated → previewed → applied → undone), CSV/Excel templates per kind, zod row schemas in packages/shared, row-level errors, idempotent apply in one transaction per batch, availability locking for future reservations, opening balances as dated opening entries, undo within 24 hours, NDPA handling of uploaded files, large files in pg-boss jobs with progress, and testing with fixture files. Use for any import kind, template or import screen.
---

# Data import

Every customer arrives from another PMS or from spreadsheets. Import is how stage 1 pilots go live, so it must be safe: **nothing is applied until the user has seen the preview, every error points to a row, and apply never breaks the non-negotiables** (scoping, no overbooking, append-only money, audit).

Known PMS export formats (Opera, eZee, Hotelogix and others) are an open question in `docs/DOMAIN.md`. Start with our own templates; a PMS format is later a **mapper** that turns that export into our template rows, never a separate apply path.

## Architecture
```
packages/shared/src/imports/
  kinds.ts           ImportKind enum and per-kind metadata (scope: organization | property | entity, depends on, template columns)
  rows/              one zod row schema per kind (roomTypes.ts, rooms.ts, guests.ts, ...)
  job.ts             ImportJob status, ImportRowError, preview summary schemas
apps/api/src/modules/imports/
  router.ts          oRPC: createUpload, getJob, listRows, skipInvalidRows, apply, undo, downloadTemplate
  parse.ts           CSV/XLSX → raw rows (streaming), header matching, trimming, encoding (UTF-8, BOM)
  validate.ts        zod per row + cross-row and database checks
  appliers/          one applier per kind: (tx, batch) => created ids
  undo.ts            dependency checks and reversal per kind
  jobs.ts            pg-boss handlers: import.validate, import.apply, import.purgeFile
  templates/         generated from the row schemas (headers, example row, notes sheet)
```

Tables: `import_jobs` (id, organizationId, propertyId?, entityId?, kind, status, fileKey, fileHash, rowCount, validCount, errorCount, progress, appliedAt, undoneAt, createdBy) and `import_rows` (jobId, rowNumber, raw (jsonb), normalized (jsonb), status `valid | invalid | skipped | applied | undone`, errors, createdRecordIds). Both carry `organizationId`.

## Lifecycle
`uploaded → validated → previewed → applied → undone` (plus `failed` for infrastructure errors).
1. **uploaded** — file stored in the private bucket, job row created, hash recorded. Same hash for the same kind and scope already applied → warn "This file was already imported on 25 Nov 2026".
2. **validated** — parse + validate every row in a job; per-row errors stored.
3. **previewed** — the user sees counts (new, updated, invalid), the first rows as they will be created, and every error. They can fix and re-upload, or **skip invalid rows** explicitly (logged). Nothing is applied while there are unskipped invalid rows.
4. **applied** — writes in batches; every created record keeps its `importJobId`.
5. **undone** — allowed within 24 hours if nothing depends on the rows.

Permission is per kind (e.g. `imports.guests`, `imports.opening_balances`), and opening balances need `finance` or `owner`. Each transition is an audit event.

## Templates per kind
Generated from the row schemas so the template, the validator and the docs never drift. Excel templates have a notes sheet with column meaning, allowed values and an example row; CSV is UTF-8 with a header row.

| Kind | Scope | Key columns (natural key in bold) | Notes |
|---|---|---|---|
| Room types | property | **code**, name, max occupancy, bed type, base occupancy | Before rooms. |
| Rate plans | property | **code**, name, room types, meal plan, rate per room type (flat, from a date), cancellation policy, deposit rule | Before corporate accounts and reservations. Seasonal and daily rates are set in the rates grid after import. |
| Rooms | property | **room number**, room type code, floor, features | Room type must exist (in DB or same file). |
| Guests | organization | name, phone (E.164), email, nationality, ID type, ID number, vip, notes | ID numbers encrypted on write; dedupe on phone/email, flagged not merged. |
| Corporate accounts | organization | **name**/RC number, credit limit, payment terms, contacts, negotiated rate per property | Rate plans must exist. |
| Future reservations with deposits | property | **source reference**, guest, arrival, departure, room type, rate plan, rate, guarantee, deposit amount, currency, deposit date, payment method, reference | Availability locked; see below. |
| City ledger opening balances | entity | company, **invoice number**, invoice date, due date, amount, currency | Feeds ageing by original dates. |
| Stock items and opening stock | property | **item code**, name, purchase/issue unit, conversion, store, quantity, unit cost | Sets average cost. |
| Employees | entity | **staff number**, name, department, property, grade, pay components, pension PIN, bank (name + masked) | Sensitive; `hr` permission. |
| Ledger opening balances | entity | **account code**, debit, credit, currency, as-of date | Must balance per entity. |

Dates accept `25/11/2026` and ISO `2026-11-25` (ambiguous formats rejected, never guessed). Money accepts `125000`, `125,000.00` and `₦125,000.00`, parsed to a decimal string; a value with more than 2 decimals is an error. Excel cells that come in as numbers are converted from the cell's text, not via float.

## Validation and row-level errors
- Each row is parsed by the kind's zod schema from `packages/shared`; zod issues map to `{ row, column, message }` in plain words ("Arrival date is after departure date"), following `ux-writing`.
- Then cross-row checks (duplicate natural keys in the file) and database checks (room type exists in this property, company exists, account code exists for this entity, property is one the member can access).
- Errors are downloadable as the original file with an extra `errors` column, so users fix in Excel and re-upload.
- `organizationId`, `propertyId` and `entityId` come from the job and auth context, **never from a column in the file**. A column naming another property is an error, not a switch of scope.

## Apply: idempotent, one transaction per batch
- Rows are applied in batches (e.g. 500). Each batch runs in **one transaction**: write records, write audit events, mark the `import_rows` as `applied` with `createdRecordIds`. A failed batch rolls back alone; the job reports which batches succeeded and can resume.
- **Idempotent:** the idempotency key is `(jobId, rowNumber)`; rows already `applied` are skipped on retry. Records also get a unique `(organizationId, scope, kind natural key)` so re-importing the same file creates nothing new; it reports "already exists" or updates only where the kind allows updates (master data, never money).
- Master data is created as normal records (UUID v7, `createdAt`/`updatedAt`), with the same services the UI uses, so business rules aren't duplicated. Appliers call services, not raw inserts.

## Future reservations: availability locking
- Each reservation goes through the normal booking service inside the batch transaction, with the row-level lock on room-type inventory per date (non-negotiable 4).
- If a date is sold out, the row is a **conflict**: it is not applied, the batch continues with other rows, and the conflict list shows guest, dates, room type and which date is full. Never apply over the overbooking limit and never silently move to another room type.
- Conflicts can be resolved by the user (change the room type in the file, close the old PMS's double booking) and re-imported; the unique source reference keeps the rest idempotent.
- Deposits are recorded as **deposits held on the reservation**, with payment method, reference and original deposit date, posted on the property's **business date** at apply with an `opening` marker, and they appear in the Deposits held report.
- Imported reservations don't push ARI per row; one debounced ARI push runs after the job (see `channel-manager`).

## Opening balances
- City ledger, deposits held, ledger accounts and stock are posted as **dated opening entries**: a dedicated `opening_balance` source, the as-of date from the file (go-live date), clearly labelled "Opening balance" in folios, statements, ledgers and reports.
- Ledger opening balances must balance per entity (debits = credits) or the whole job fails validation; any difference must be put explicitly on an opening balance equity/suspense account by the user, never auto-plugged.
- Amounts in foreign currency store the FX rate, source and date (non-negotiable 5).
- Opening entries are append-only like every other posting; undo creates reversals, it doesn't delete.
- One set of opening balances per kind per entity/property: a second job is rejected unless the first was undone.

## Undo (24 hours, only if nothing depends)
- Allowed for 24 hours after apply, with permission and a reason (audited).
- Before undoing, check dependencies per kind: a room with a reservation, a guest with a stay or folio, a reservation checked in or with postings beyond its deposit, a company with an invoice, a stock item issued, an employee on a payroll run, any opening entry already included in a closed period or night audit. If any exist, undo is blocked and the user sees which rows are blocking.
- Undo runs in one transaction: master data is archived (`archivedAt`) or hard-deleted only if no history exists; money is reversed with reversing entries; reservations are cancelled through the booking service so inventory is released (and ARI pushed).
- Undo is all-or-nothing for the job; no partial undo.

## Uploaded files and NDPA
- Files go to the **private bucket** under `imports/{organizationId}/{jobId}`, never public, accessed only via short-lived signed URLs, size-limited and type-checked (CSV/XLSX only; macros never executed; formulas read as values).
- Guest and employee files contain personal data: they are deleted by `import.purgeFile` after apply plus a retention period (configuration, short; enough to cover the 24-hour undo window), and deleted on job cancellation. `import_rows.raw` for personal-data kinds is cleared at the same time, leaving only row numbers, status and error codes.
- ID numbers are encrypted on write and never written to logs, error messages or the error download in clear (masked).
- Logs carry `organizationId`, `propertyId`, `jobId` and row numbers, never cell values.

## Large files: pg-boss jobs with progress
- Parsing, validation and apply run in pg-boss jobs (`import.validate`, `import.apply`), never in the request. Stream the file; don't load a large workbook into memory.
- The job updates `progress` (rows processed / total) per batch; the UI polls `getJob` and shows a progress bar and live counts. Users can leave the page and come back.
- Jobs are resumable after a crash because of the per-row idempotency; a stuck job is marked `failed` with a retry action.
- A row limit per file is configuration; above it, ask the user to split.

## Testing
- **Fixture files** in `apps/api/src/modules/imports/__fixtures__/`: one valid file per kind (CSV and XLSX), plus files with bad dates, ambiguous dates, float-looking money, missing columns, extra columns, duplicate keys, BOM/encoding issues, Excel numeric cells, and an empty file. Fixtures use fake data only.
- **Row schemas:** unit tests per kind for valid and invalid rows and the error messages.
- **Apply:** applying the same job twice creates nothing new; a failed batch rolls back alone and resume completes it; records carry `importJobId`; audit events are written.
- **Reservations:** importing more reservations than inventory reports conflicts and never exceeds the overbooking limit, including the concurrency case (an import running while a front desk booking takes the last room — see the no-overbooking test in `testing-patterns`).
- **Opening balances:** unbalanced ledger file is rejected; balances appear as opening entries in ageing, deposits held and the trial balance.
- **Undo:** succeeds with no dependents, is blocked with dependents (and lists them), is refused after 24 hours, and reverses money with reversal entries.
- **Scoping and isolation:** a file can't create rows in another organization or a property the member can't access; another organization's job id returns not found.
- **NDPA:** the file and raw personal data are gone after the retention job runs.
- **E2E:** Playwright uploads a fixture, sees the preview and row errors, skips invalid rows, applies, watches progress, and undoes.
