# 0016 · RustFS for local object storage, not MinIO

- **Date:** 2026-11-25
- **Status:** accepted

## Context
Decision 0011 planned MinIO as the local stand-in for Cloudflare R2. When building Stage 0, brick 2, the `minio/minio` image no longer exists on Docker Hub (the repository returns 404), so there is no maintained, pinned MinIO image to run locally or in CI.

## Decision
Local development and CI use **RustFS** (`rustfs/rustfs`, pinned to an exact version at least two weeks old), an S3-compatible store with a web console, as the `storage` service in `docker-compose.yml` (container `vento-hotels-storage`, API on port 9100, console on 9101). Production still uses Cloudflare R2. App code talks only to the S3 API through our storage interface, never to anything RustFS-specific, apart from the `/health` endpoint used by `pnpm db:status`.

## Consequences
- Swapping the local store again (SeaweedFS, Garage, or MinIO if it returns) is a `docker-compose.yml` and CI change only.
- RustFS is young (1.0.x). It's for local and CI only, so a bug costs us a local workaround, never production data.
- Tests that need storage behaviour R2 has but RustFS lacks must say so and run against R2 in staging instead.
- Docs that said MinIO (CLAUDE.md, ARCHITECTURE.md, decision 0011) now point here.

## Alternatives considered
- **Last published MinIO image:** unmaintained, with no security fixes. Rejected.
- **SeaweedFS:** mature, but needs a separate S3 config file for credentials and has a less friendly console. Good fallback.
- **Garage:** solid, but needs a layout and key setup step after the first start. More moving parts for local dev.
- **LocalStack:** heavier than we need for S3 alone.
- **R2 for local dev:** needs an account and network, breaks offline development, and mixes developers' data.
