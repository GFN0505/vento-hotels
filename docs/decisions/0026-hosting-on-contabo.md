# 0026 · Hosting on Contabo servers we run ourselves, with Docker Compose

- **Date:** 2026-11-26
- **Status:** accepted

## Context
The hosting research (docs/research/hosting.md, PR #20) found Europe faster from Lagos than South Africa and recommended a managed platform (Render, Frankfurt), with DigitalOcean as runner-up. NDPA 2023 allows hosting abroad with safeguards. The owner chose **Contabo**: low cost and a data centre in Germany. Contabo rents servers; it has no managed database, load balancer or preview environments, so we run those parts ourselves.

## Decision
- One Contabo Cloud VPS per environment (staging, production), Ubuntu 24.04, EU (Germany) region.
- Each runs `deploy/compose.yml`: Caddy (automatic HTTPS, serves the built web app, routes `/api`, `/rpc`, `/health` to the API on the same origin per decision 0019), the API with its background jobs, Postgres 18 (not exposed), and a backup container.
- **Images** (`deploy/api.Dockerfile`, `deploy/web.Dockerfile`) are built by GitHub Actions on every merge to `main` and pushed to GitHub Container Registry. **Deploys** copy the compose file, pull images, run migrations, restart, then require `/health` to say `ok`. Staging deploys on every merge; production by hand with a reviewer.
- **Backups:** `pg_dump` every hour (kept 48 hours) and daily (kept 35 days) to a private Cloudflare R2 bucket with its own key; a restore test on the 1st of each month loads the newest daily dump into a scratch database. Worst-case data loss is about an hour until continuous archiving is added.
- **Hardening:** `deploy/bootstrap.sh` sets up a `deploy` user with a key, firewall (SSH, HTTP, HTTPS only), automatic security updates, fail2ban, and turns off SSH password sign-in. No access logs at the proxy (URLs can hold sign-in tokens).
- **`DEPLOY_ENV`** (`local`, `staging`, `production`) tells the API which server it's on: production refuses the demo seed and unreleased modules; staging may load the demo group. On any server, email is refused with a warning until an email provider is chosen, so sign-in links never land in logs.

## Consequences
- Lowest monthly cost, and portable: the same compose file runs on any Linux server.
- We own patching, disk space, Postgres upgrades and restores; the runbook is docs/ops/deploy.md.
- No preview per pull request; owner reviews happen on staging with the demo group.
- Continuous archiving (point-in-time restore) and a second server for failover are planned before more than a handful of hotels are live.

## Alternatives considered
- Render (managed, previews, 7-day point-in-time restore): recommended by the research, about $90–125/month; not chosen by the owner.
- DigitalOcean App Platform with managed Postgres: runner-up.
- Kubernetes or Coolify on Contabo: more moving parts than a pilot needs.
