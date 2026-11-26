# The API and its background workers. Node runs the TypeScript directly (type stripping), as in
# development, so the image is the source plus production dependencies. Build from the repo root:
#   docker build -f deploy/api.Dockerfile -t vento-hotels-api .
FROM node:24.22.3-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
# Every workspace's package.json, so pnpm can check the lockfile; only the API's tree is installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod --filter "@vento/api..."

FROM base
ENV NODE_ENV=production
COPY --from=deps /app /app
COPY packages/shared/src packages/shared/src
COPY apps/api/src apps/api/src
COPY apps/api/drizzle apps/api/drizzle
WORKDIR /app/apps/api
USER node
EXPOSE 3010
CMD ["node", "src/server.ts"]
