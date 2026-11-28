# 0031 · Guest ID numbers are encrypted in the database; ID photos live in the private bucket

- **Date:** 2026-11-28
- **Status:** accepted

## Context
Check-in records each registered guest's ID type and number, and for foreign nationals the passport and visa numbers (brick 8). The owner also asked for a photo or scan of the lead guest's ID at check-in (front desk spec, question 3: "Nigerian hotels request for a photo or document of the ID, if it's physical it can be scanned"). Under the NDPA 2023 these are the most sensitive things a hotel holds; CLAUDE.md requires ID numbers encrypted at rest and masked in the UI, and decision 0011 puts guest ID images in a private bucket behind short-lived links.

## Decision
- **Numbers:** encrypted by the API before they reach the database (AES-256-GCM, a fresh 12-byte IV each time, stored as `v1.<key id>.<iv>.<tag>.<ciphertext>`), with a masked form stored beside them (`••••••6612`, `G0••••12`). The key comes from `GUEST_DATA_KEY` (32 bytes, base64); its key id is the first 8 hex characters of its SHA-256, so a rotated key can be added while old rows still decrypt. Locally, when `GUEST_DATA_KEY` is unset, a fixed development key is used (the demo seed and the browser tests read the same rows); staging and production refuse to start without it.
- Decrypted only by **Reveal** (`guest.id_view`, a reason, shown for 30 seconds, `guest.id_revealed`, never offline, `Cache-Control: no-store`) and, from brick 15, the logged guest register export. Never in responses otherwise, logs, audit events, PDFs, the saved-data store or the service worker cache.
- **Images:** the browser downscales photos to 1600px and re-encodes them as JPEG (no EXIF); the API checks the real type from the bytes (JPEG, PNG, WebP or PDF), strips JPEG metadata again, caps the size at 5 MB, and writes the file to a **separate private bucket** (`S3_PRIVATE_BUCKET`, default `<S3_BUCKET>-private`) under a key of ids only. The upload goes through the API, not a signed upload URL, so the server checks the file before it is stored and an offline device can send it on sync.
- Viewing a saved image needs `guest.id_view` and a reason; the API answers with a signed GET link that expires in 60 seconds and writes `guest.id_document_viewed`.
- Documents are kept with the guest's registrations and archived with them; nothing is hard-deleted while history exists. Uploads never attached to a check-in are deleted after a day. Retention periods are an open question for the lawyer (`docs/DOMAIN.md`).

## Consequences
- A database dump alone reveals no ID number; the key lives only in the server's environment and the backups of it.
- Search by ID number isn't possible (and isn't needed in Stage 1).
- The private bucket must be created with the servers (no public access, no CORS) before check-in goes live (`docs/ops/deploy.md`).

## Alternatives considered
- Postgres `pgcrypto`: the key would travel in every query and appear in the database's logs.
- Browser-direct uploads through a signed URL (the logo's way): the server couldn't check or clean the file before it lands, and the offline outbox would need the URL from a live server anyway.
- Hashing the numbers: the register must be able to show the full number to the authorities.
