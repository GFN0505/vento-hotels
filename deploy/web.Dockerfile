# The web app, built once and served by Caddy, which also gives HTTPS and sends /api, /rpc and
# /health to the API (one origin, decision 0019). Build from the repo root:
#   docker build -f deploy/web.Dockerfile -t vento-hotels-web .
FROM node:24.22.3-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter "@vento/web..."
COPY packages/shared packages/shared
COPY apps/web apps/web
# Error tracking for the browser is set at build time; empty means off.
ARG VITE_SENTRY_DSN=""
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN NODE_ENV=production pnpm --filter @vento/web build

FROM caddy:2.10.2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
