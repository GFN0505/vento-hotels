# Deploying Vento Hotels on Contabo

How the servers are set up and how a release reaches them (decision 0026). One Contabo VPS per environment: **staging** (every merge to `main`) and **production** (deployed by hand). Each runs the same Docker Compose stack from `deploy/compose.yml`:

| Container | What it does |
|---|---|
| `caddy` | HTTPS (certificates from Let's Encrypt, renewed by itself), serves the web app, sends `/api`, `/rpc` and `/health` to the API |
| `api` | The API and its background jobs (pg-boss) |
| `postgres` | The database, never reachable from the internet |
| `backup` | Hourly and daily dumps to a private R2 bucket; a restore test on the 1st of each month |

## One-time setup (owner or devops)

1. **Order two servers** at Contabo in the **European Union (Germany)** region: Cloud VPS with Ubuntu 24.04, your SSH key added at checkout. Staging can be the smallest plan; production at least 4 vCPU / 8 GB. Consider the Auto Backup add-on for production as a second safety net.
2. **Domain:** point an A record at each server, e.g. `app.<your-domain>` → production, `staging.<your-domain>` → staging.
3. **Cloudflare R2:** create three private buckets: `vento-files` (app files; one per environment is better), `vento-backups-staging`, `vento-backups-production`. Create API tokens: one for the app's files bucket, and a separate one for each backups bucket, so the app can never delete its own backups. On the files bucket, add a CORS rule allowing `PUT` and `GET` from the web app's origin (e.g. `https://app.<your-domain>`) with any header: browsers upload hotel logos straight to it through signed links. The app's settings are `S3_ENDPOINT` (the R2 S3 endpoint), `S3_REGION=auto`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_BUCKET`.
4. **Deploy key:** on your computer, `ssh-keygen -t ed25519 -f vento-deploy -C github-actions-deploy`. Keep the private key for step 7.
5. **Prepare each server** (as root): download `deploy/bootstrap.sh`, read it, then run `sh bootstrap.sh "$(cat vento-deploy.pub)"`. It installs Docker, creates the `deploy` user with that key, turns on the firewall (SSH, HTTP, HTTPS), automatic security updates and fail2ban, and turns off SSH password sign-in.
6. **Settings on each server:** copy `deploy/.env.server.example` to `/opt/vento/.env`, fill every value (`DEPLOY_ENV=staging` or `production`), then `chmod 600 /opt/vento/.env && chown deploy /opt/vento/.env`.
7. **GitHub** › Settings › Environments: create `staging` and `production` (give `production` required reviewers). In each, set the variables `DEPLOY_HOST` (server IP) and `DEPLOY_DOMAIN`, and the secrets `DEPLOY_SSH_KEY` (the private key from step 4) and `DEPLOY_KNOWN_HOSTS` (output of `ssh-keyscan <server-ip>`). Optional repository variable: `VITE_SENTRY_DSN`.
8. **Images:** after the first run of the Deploy workflow, open GitHub › Packages › `vento-hotels-api` and `vento-hotels-web` › Package settings, and make both public (the repository is public; nothing secret is in them). Otherwise the servers can't pull them.
9. **First deploy:** Actions › Deploy › Run workflow › `staging`. Then, on staging only, load the demo group: `ssh deploy@<staging-ip> 'cd /opt/vento && docker compose run --rm -T api node src/seed/cli.ts'`.
10. **Monitoring:** add an uptime check (e.g. Better Stack or UptimeRobot) on `https://<domain>/health` every minute, alerting when it isn't `200`. `/health` turns `degraded` if the database, storage or background jobs stop.

## Releasing

- **Staging:** automatic on every merge to `main`: images are built, copied files updated, migrations run, containers restarted, then `/health` must say `ok`.
- **Production:** Actions › Deploy › Run workflow › `production`, optionally with the commit SHA that's been checked on staging. Same steps, after a reviewer approves.
- **Roll back:** run the workflow again with the previous good SHA. Migrations only ever move forward, so a rollback across a migration needs a fix-forward instead; check `apps/api/drizzle` in the diff first.

## Everyday operations

All from `ssh deploy@<server>` then `cd /opt/vento`:

| Task | Command |
|---|---|
| See what's running | `docker compose ps` |
| API logs (JSON, request ids) | `docker compose logs -f --tail 200 api` |
| Backup now (before something risky) | `docker compose exec backup backup.sh now` |
| Run the restore test now | `docker compose exec backup backup.sh restore-test` |
| Backup and restore-test results | `docker compose logs backup \| grep backup:` |
| Turn a module on for a group | `docker compose run --rm -T api node src/features/cli.ts on <group> <feature> --reason "…"` |

## Restoring the database

1. Find the dump: `rclone lsf r2:<backups-bucket>/hourly` (or `daily`) from inside the backup container: `docker compose exec backup sh`.
2. Stop the API: `docker compose stop api caddy`.
3. Inside the backup container: `rclone copyto r2:<bucket>/<kind>/<file> /tmp/r.dump && dropdb vento && createdb vento && pg_restore --no-owner -d vento /tmp/r.dump`.
4. Start again: `docker compose up -d`, then check `/health`.

Hourly dumps mean up to an hour of data can be lost in the worst case. Continuous archiving (point-in-time restore) is a planned improvement before more than a handful of hotels are live.

## Not yet

- **Preview per pull request:** not on Contabo; reviews use staging with the demo group.
- **Email provider:** still an open question (docs/DOMAIN.md). Until it's chosen, servers send no email and log a warning instead, so sign-up confirmation and invites don't work on staging or production; use the demo people on staging.
