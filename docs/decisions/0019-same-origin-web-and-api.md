# 0019 · The web app and the API share one origin

- **Date:** 2026-11-25
- **Status:** accepted

## Context
The web app (Vite + React) and the API (Hono) are separate processes. Sign-in uses cookies, and hotel staff will use Vento on phones and shared tablets with patchy connections.

## Decision
The browser only ever talks to one origin. In development, Vite forwards `/api` (sign-in) and `/rpc` (the typed API) to the API on port 3000. In production, the same path routing happens at the host or reverse proxy (to be set when hosting is chosen in brick 16). `BETTER_AUTH_URL` and `WEB_ORIGIN` are the address people open in the browser.

## Consequences
- Session cookies are first-party: no CORS, no third-party cookie problems on mobile browsers.
- Email links point at the web address and reach the API through the same routing.
- Browser tests run their own API and web app on ports 3100 and 5174 with the same setup.
- Hosting must support path-based routing to two services, or serve the built web app from the API. Either works.

## Alternatives considered
- **API on its own subdomain with CORS:** cross-site cookies are increasingly blocked by browsers, and preflight requests add latency on weak networks.
- **Bearer tokens in local storage:** exposed to any script injected into the page. Cookies marked httpOnly aren't.
