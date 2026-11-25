# 0011 · Infrastructure: jobs, files, PDFs, providers, observability

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Night audit, ARI pushes, webhooks, messages and reports need background work. Guest IDs, invoices and board packs need storage and PDFs. The team is small, so every extra service costs.

## Decision
- **Jobs:** pg-boss on the same Postgres. No Redis.
- **Files:** S3-compatible object storage with signed URLs (Cloudflare R2 planned for production; locally MinIO was planned, replaced by RustFS in decision 0016); guest ID images in a private bucket with short-lived links.
- **PDFs:** `@react-pdf/renderer` on the API; thermal receipts and kitchen tickets as 80mm print layouts.
- **Third parties** (email, SMS, WhatsApp, channel manager, payments) each sit behind a provider interface with a mock for tests.
- **Observability:** pino structured logs with `organizationId`, `propertyId` and request id (never guest personal data), Sentry for errors in web and API, uptime checks.

## Consequences
- One database to back up and run; job volume must stay within what Postgres handles well.
- Messaging providers (e.g. Termii, Twilio, Resend) are still open in `docs/DOMAIN.md`.
- Hosting for the API, database and web app is **not decided yet**; it gets its own record before the first production deploy.

## Alternatives considered
- BullMQ with Redis: another service to run for no need at our scale.
- Storing files in Postgres: bloats backups and can't serve signed links.
- Headless browser PDFs: heavier to run and slower than react-pdf.
- Calling providers directly from domain code: locks us in and makes testing hard.
