---
name: printing
description: How we print — A4 PDFs with @react-pdf/renderer on the API (registration card, invoice/folio with tax lines, city ledger statement), 80mm thermal receipts and kitchen/bar tickets as browser print layouts, ESC/POS through an optional local print bridge for network kitchen printers (open question), printing while offline from local data, reprints as audit events and a leakage signal, black-and-white friendly layouts, tabular numbers, ₦ money formatting, and testing with PDF snapshots and visual checks. Use for any document, receipt, ticket or report that gets printed.
---

# Printing

Two families of output, built differently:
- **A4 documents** (registration card, invoice/folio, city ledger statement, printable reports) are PDFs rendered on the API with `@react-pdf/renderer`. The server has the full, authoritative data and the PDF is the same everywhere.
- **80mm thermal output** (POS receipts, kitchen/bar tickets, cashier shift slips) are print layouts rendered in the browser and printed with `window.print()` and an 80mm print stylesheet. They must work offline, so they can't depend on the API.

Printer support is **not settled**. Which thermal printers we certify, and whether network kitchen printers need a local print bridge or the OS/Android print service is enough, is an open question in `docs/DOMAIN.md` (*Printing*). Don't claim support for a specific printer model in code, docs or UI copy until it has been tested and recorded there.

## Architecture
```
packages/shared/src/printing/
  format.ts          formatMoney, formatDate, formatStay — shared by PDFs and print layouts
  documents.ts       zod schemas for each document's data (RegistrationCardData, FolioDocData, StatementData, ReceiptData, TicketData)
apps/api/src/modules/documents/
  pdf/
    theme.ts         fonts (registered once, with tabular figures), sizes, greys; no colour that carries meaning
    components/      Header (property, entity RC/TIN, logo), MoneyTable, TaxSummary, Footer (page x of y, printed at/by)
    registration-card.tsx
    folio.tsx        invoice and folio share this component; `kind` changes title and numbering
    statement.tsx    city ledger statement with ageing
  service.ts         loads data (org + property scoped), checks permission, renders, writes audit event
  router.ts          oRPC: returns a short-lived signed URL or streams the PDF
apps/web/src/printing/
  print.css          @page 80mm rules, hides app chrome
  ReceiptLayout.tsx  80mm receipt
  TicketLayout.tsx   kitchen/bar ticket
  printThermal.ts    renders a layout into a hidden iframe and calls print(); or hands off to the bridge
  bridge.ts          optional client for the local print bridge (feature-flagged, see below)
```
Document builders take a typed data object (from `documents.ts`) and render it; they never query the database themselves. That keeps them pure and snapshot-testable.

## A4 documents (@react-pdf/renderer)
- **Registration card:** property and entity details, guest name, nationality, address, phone, ID type and **masked** ID number (last 4 only, never decrypted for print unless the law requires the full number on the guest register export, which is a separate permissioned export), stay dates, room, rate, guarantee, foreign national section (passport, visa/permit, arrival from/next destination) when applicable, signature line. Printed or signed on a tablet at check-in.
- **Invoice / folio:** header with entity name, RC number, TIN and VAT status; folio number; guest or company; stay dates. Lines show business date, description, department, amount. Below the lines a **tax summary** grouped by tax line (VAT, consumption tax, service charge) using the rate, base and amount **stored on each posting** — never recompute taxes at print time. Inclusive pricing still shows the breakdown. Voids/corrections show as their own negative lines, not hidden. Totals: charges, payments, balance. Foreign-currency folios show the currency and FX rate, source and date as stored.
- **City ledger statement:** company, period, opening balance, invoices and payments in date order, closing balance, ageing buckets (0–30, 31–60, 61–90, 90+), payment terms and bank details of the **entity** that owns the receivable.
- Any document carrying tax lines must follow `nigeria-compliance` (e-invoicing requirements are an open question; don't fake a fiscal number).
- Renders run on the API, not in a request hot path for big ones: a statement or report over a few pages is generated in a pg-boss job, stored in the private bucket, and the user gets a signed URL when it's ready.
- Generated PDFs that are financial records (invoices, statements) are stored with a content hash so a reprint is the same document, not a regenerated one with newer data. A corrected invoice is a new document that references the old one.

## 80mm thermal (browser print)
- Layout width is the printable area of an 80mm roll (commonly ~72mm; don't assume, keep it a CSS variable). `@page { size: 80mm auto; margin: 0 }`, monospace or a narrow sans with tabular figures, 1 column, no images except an optional monochrome logo.
- **Receipt:** outlet and property, entity TIN, check number, table/room, server, date/time and business date, items with qty and amount, discounts and comps as visible lines, tax summary, total, payment method(s) and reference, change. "Posted to room 214" for room charges, with the guest's signature line.
- **Kitchen/bar ticket:** large item names and quantities, modifiers indented, table, server, time sent, course, and **no prices**. Routed by the menu item's station. Voids after send print a clear "VOID" ticket to the same station.
- `printThermal.ts` renders into a hidden iframe so the app's CSS and chrome never leak into the print; it waits for fonts before calling `print()`.
- Browser print shows the print dialog unless the device/browser is set up for silent printing (kiosk mode or a managed policy). Document setup per device in the device registration flow; don't promise one-tap printing in UI copy until it's confirmed on the target devices.

### Local print bridge (optional, open question)
For network kitchen/bar printers that the browser can't reach well, a small local app on the property LAN can accept print jobs and send **ESC/POS** to the printer.
- Behind a feature flag per outlet, with `bridge.ts` as the only client. The default path is always browser print.
- The bridge receives a typed `TicketData`/`ReceiptData` payload (not HTML) and renders ESC/POS itself.
- It is paired to a registered device and property; it never talks to our API with credentials of its own beyond that pairing.
- If the bridge is unreachable, fall back to browser print or on-screen ticket and tell the user.
- Whether we build this or rely on OS/Android print services is unresolved in `docs/DOMAIN.md`. Don't build it out beyond a spike until that is decided.

## Printing while offline
- Receipts and tickets print from **local data** (the check in IndexedDB), so POS keeps printing during power and internet cuts (see `offline-sync`).
- Anything printed from a record that isn't synced yet shows a clear line: **"Not yet synced — provisional"**, plus the client-generated check id. Totals are as computed on the device.
- The print itself is queued as an audit command in the outbox (`print.receipt`, `print.ticket`) so the server learns about every offline print, including reprints.
- A4 PDFs need the API. Offline, the folio screen shows "Print available when you're back online"; the last-synced folio view is on screen only, marked with its as-of time.

## Reprints are audit events
- Every print records an audit event: document type, record id, copy number, member, device, property, business date. The first print is `original`; every later one is a **reprint** and the document says "REPRINT · copy 2" in the header.
- Reprinting a closed POS bill or a settled invoice is a **leakage signal** ("bills reprinted" in `PRODUCT.md`): it feeds the exception list and the owner's daily report with staff names. Thresholds are configuration.
- Reprinting a bill after it was paid needs no extra permission, but it is always logged; it never reopens or changes the bill.
- Never print a bill that differs from the posted record. A "pro forma" or "preview" before payment is labelled as such.

## Layout rules (all printed output)
- **Black-and-white friendly:** most hotels print on mono lasers and thermal printers. No meaning carried by colour; use weight, borders, labels. Greys only for rules and backgrounds that survive photocopying.
- **Tabular numbers** everywhere amounts appear (`font-variant-numeric: tabular-nums` on the web; a font with tabular figures registered for react-pdf). Amounts right-aligned in their column.
- **Money** through `formatMoney` from `packages/shared`: `₦125,000.00`, `$85.00`; negatives as `−₦5,000.00` (true minus sign) or in a credit column, consistently per document. Use the decimal library; never format a float. Check the chosen PDF font includes the `₦` glyph (U+20A6); a missing glyph renders as a box.
- Dates as `25 Nov 2026`, stays as `25–28 Nov 2026 · 3 nights`, times in the property's time zone. Print both the business date and the printed-at timestamp on financial documents.
- Footer: printed by, printed at, page x of y. No guest personal data beyond what the document needs (NDPA).
- Copy follows `ux-writing`.

## Testing
- **PDF snapshots:** render each document from a fixture data object (from factories, seeded in `pnpm db:seed` data) and snapshot the extracted text and structure, not raw bytes (bytes change with timestamps/metadata; fix the clock and the document id in tests). Cases: inclusive vs exclusive pricing, multiple tax lines, voids/corrections, foreign currency with FX, multi-page folio, foreign national registration card, statement with all ageing buckets, reprint marker.
- **Visual checks:** render PDFs to PNG in CI for the main documents and compare against approved images with a small tolerance; review diffs by eye. For 80mm layouts, a Playwright test opens the print layout with `page.emulateMedia({ media: 'print' })` at an 80mm-wide viewport and screenshots it.
- **Unit:** `formatMoney` (₦, $, negatives, large amounts, rounding with decimals), tax summary grouping, masked ID output.
- **Audit:** printing twice writes `original` then `reprint`; the reprint shows in the exception feed.
- **Offline:** Playwright with `context.setOffline(true)`: print a receipt for an unsynced check, assert the "Not yet synced" line and that a print command is queued; go online and assert the audit event lands.
- **Scoping:** a member can't fetch a PDF for another organization or a property they're not allowed (signed URL bound to org and property, short expiry).
- Real-printer checks are manual, on the devices pilot hotels actually use; record results under the printing open question in `docs/DOMAIN.md` before claiming support.
