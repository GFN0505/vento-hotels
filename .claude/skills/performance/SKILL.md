---
name: performance
description: Performance budgets and techniques for a fast app on mid-range Android phones, weak Nigerian networks and power cuts — bundle size, Core Web Vitals, offline-first front desk and POS, tape chart rendering, images, data loading, API latency, database queries, and how to measure. Use when building heavy screens, adding dependencies, or investigating slowness.
---

# Performance

## Budgets (enforced in CI where possible)
| Metric | Budget |
|---|---|
| Web first-load JS (gzip) | ≤ 200 KB |
| Per-route chunk | ≤ 80 KB |
| Booking engine / guest app first-load JS | ≤ 120 KB |
| LCP (Moto G-class device, Fast 4G throttle) | ≤ 2.5 s |
| INP | ≤ 200 ms (POS add-item and room-tile tap ≤ 100 ms) |
| CLS | ≤ 0.05 |
| Tape chart: 300 rooms × 30 days first render | ≤ 500 ms; scroll at 60 fps on a mid-range laptop |
| Front desk / POS action while offline | Applied locally in ≤ 100 ms |
| PIN sign-in on a shared device (online or offline) | ≤ 300 ms from last digit to usable screen |
| Receipt / kitchen ticket print after Send or Pay | Print dialog or bridge job in ≤ 1 s, offline included |
| API p95 for list/detail endpoints | ≤ 200 ms |
| API p95 for availability check / booking | ≤ 300 ms |
| API response size for a list page | ≤ 50 KB |

## Web
- **Check before adding a dependency:** size on bundlephobia / `pnpm why`. Prefer tree-shakable imports (`lucide-react` named icons, `date-fns` functions). No moment, lodash (full), or UI kits beside shadcn.
- **Load data before render** with route loaders. Prefetch on hover/touch (`preload: 'intent'`). Use `keepPreviousData` for paginated tables.
- **Lazy-load heavy parts:** charts (Recharts), rich text, PDF preview (folio, invoice), image gallery lightbox, the tape chart's drag layer.
- **Images:** serve resized variants (thumbnail 400w, card 800w, hero 1600w) in WebP/AVIF from the storage/CDN, with `srcset`, `sizes`, `width`/`height`, `loading="lazy"` (except the LCP image, which gets `fetchpriority="high"`). Blur placeholder for room and property photos on the booking engine.
- **Lists:** virtualize anything over ~100 rows (TanStack Virtual).
- **Rendering:** avoid context values that change often at the top of the tree; keep state local; only memoize after profiling.
- **Fonts:** self-host, subset to Latin, `font-display: swap`, preload the main weight only.
- **Weak networks:** show cached data immediately (TanStack Query `staleTime`), retry failed GETs with backoff, keep form input on failure, and show an offline banner when the app can't reach the API (don't trust `navigator.onLine` alone; ping `/health`).

## Tape chart and room board
- Virtualize **both axes**: rows (rooms) with TanStack Virtual, columns (dates) windowed to the visible range plus a small overscan. Never render 300 × 30 cells as DOM nodes.
- Draw the grid background with CSS (`background-image` gradients or a single canvas), and render only stay bars, OOO blocks and the focused cell as elements, absolutely positioned by `(row, dayOffset)`.
- Fetch one compact payload per visible range: `{ rooms, stays: [roomId, arrival, nights, status, guestShort], ooo, availabilityByTypeAndDate }`. Load the next 14 days on horizontal scroll. Target ≤ 60 KB gzip for 300 rooms × 30 days.
- Drag uses transforms on a single overlay element and `pointermove` throttled to `requestAnimationFrame`; commit (and the availability check) only on drop.
- Room board tiles: CSS grid, no per-tile queries; status updates arrive as a patch and update one tile, not the whole board.

## Offline-first front desk, POS and housekeeping
Power cuts and dropped internet are daily events. The generator coming on drops the router for minutes; the desk must keep working.
- **Service worker** precaches the app shell and route chunks for front desk, POS and housekeeping, so a reload with no network still opens.
- **Local data in IndexedDB:** today's arrivals, in-house guests and folios, departures, room statuses, menus and prices per outlet, open checks. Refresh in the background; show "Last updated 14:32".
- **Writes go to an outbox queue** (IndexedDB) with a client-generated UUID v7 and an **idempotency key**, applied optimistically to local state, then synced in order when the API is reachable. The server dedupes by key, so a retry after a timeout never double-posts a charge or payment.
- Actions that need the server's answer (new booking or room move that changes availability, card payment, post to room with credit check) are clearly marked: queue only where the rule can be checked safely later, otherwise show "Needs connection" and offer the offline alternative (e.g. record a cash or transfer payment).
- Conflicts on sync (room already taken, check already paid on another device) surface in a "Needs attention" list with a clear fix, never silently dropped.
- Persist the queue on every write, not on `beforeunload`; the device may lose power with no warning. Keep the queue small (sync in batches of ~50).
- **PIN sign-in and printing don't wait for the network.** PIN checks run against the device's cached hashes; receipts and tickets render from local data (see `printing`). Neither blocks on an API call.
- Test with the network cut mid-request and with the tab killed while changes are pending.

## API and database
- Select only needed columns; never return whole joined graphs to a list view.
- Every filtered or sorted column has an index (composite with `organization_id`, `property_id` first). Check plans with `EXPLAIN ANALYZE` for new list queries.
- No N+1 queries: batch with `inArray` or joins.
- Availability reads come from the per-date inventory rows, not by counting stays. Keep the locked section of a booking short: lock, check, write, commit — no external calls (channel push, WhatsApp, Paystack) inside the transaction; enqueue them.
- Paginate everything; count totals efficiently (or use estimated counts on very large tables like folio postings).
- Compress responses (Hono `compress`). Set cache headers on static and media assets; the booking engine's room pages are CDN-cached with short revalidation.
- Heavy work (night audit reports, the owner's daily report, statements, PDFs, ARI full resync, bulk WhatsApp messages, exports, imports, board packs) runs in pg-boss background jobs, with progress shown in the UI.
- Audit events are written in the same transaction as the change, so keep them small (changed fields only in before/after) and index them for the exception queries (`organization_id, property_id, business_date, action`).

## Measuring
- `pnpm --filter web build` prints chunk sizes — compare before and after a change.
- Lighthouse (mobile preset) on the booking engine, the guest app, Front desk home, a list page and a reservation detail page.
- In the browser: Performance panel with 4× CPU slowdown and Fast 4G throttle; for the tape chart, seed a 300-room property and record a scroll and a drag.
- Offline: DevTools "Offline" while performing check-in, post charge and POS payment, then reconnect and verify one server row per action.
- API: log request duration; investigate anything over budget. Load-test concurrent bookings on the same room type and date.

Report numbers before and after for any performance change.
