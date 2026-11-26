# 0025 · Background jobs on pg-boss, structured logs, and error tracking without personal data

- **Date:** 2026-11-26
- **Status:** accepted

## Context
From Stage 1, work happens outside a request: night audit steps, pushes to the channel manager, webhooks, guest messages and the owner's daily report. The stack already says pg-boss, pino and Sentry (CLAUDE.md, ARCHITECTURE.md). This records how they're set up before the first real jobs, and before hosting is chosen.

## Decision
- **Jobs:** pg-boss in the same Postgres (schema `pgboss`), started by the API process when `JOBS_ENABLED` is true (default), so one process is enough for pilots. Each job type has a zod schema, its own queue and retry policy (`apps/api/src/jobs/queue.ts`). Handlers must be idempotent.
- **First jobs:** email goes through the `email.send` queue, so a provider failure is retried with backoff (6 tries from 10 seconds) instead of losing a confirmation or invite. Finished email jobs are deleted after an hour, because their text holds sign-in links. A `system.heartbeat` runs every minute; `/health` reports `jobs` and turns `degraded` after three missed beats, so an uptime monitor notices stopped workers.
- **Logs:** pino JSON lines. One line per request with method, path (never the query string), status and time, under a request id that's returned as `x-request-id`. Lines written while handling a request carry its request id and, once access is checked, the organization id. Emails, names, tokens, PINs, passwords and message text are hidden even if passed to a log call.
- **Error tracking:** Sentry on the API and web app, off unless `SENTRY_DSN` / `VITE_SENTRY_DSN` are set. Only unexpected failures are sent (crashes and 5xx, not "not allowed"). No user, cookies, headers, bodies or query strings, enforced by `dataCollection` and stripped again in `beforeSend`. Reports are tagged with the request and organization ids. The web SDK loads after the page, so it adds nothing to the first download.

## Consequences
- No Redis or separate worker service to run. When load needs it, a second process with `JOBS_ENABLED=true` and the web-facing one with `false` splits them without code changes.
- Unit tests send email directly (in memory); browser tests and real deployments go through the queue.
- Sentry's data region and plan, and the uptime monitor, are chosen with hosting.

## Alternatives considered
- BullMQ or another Redis queue: another service to run and back up; no transactional enqueue with our writes.
- Sending email inline only: a provider blip loses a confirmation email and the person is stuck.
- Logging with `console`: no structure, no request ids, easy to leak personal data.
