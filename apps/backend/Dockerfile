# syntax=docker/dockerfile:1
# VibeRide backend (NestJS) — multi-stage pnpm workspace build.
# Build from the REPO ROOT so the whole workspace is in the context:
#   docker build -f apps/backend/Dockerfile .

# ---- base: node + pnpm (same version as "packageManager" in package.json) ----
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare pnpm@10.34.4 --activate
WORKDIR /repo

# ---- deps: resolve packages from the lockfile only (maximises layer cache) ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline

# ---- build: compile the backend plus every workspace package it depends on ----
FROM deps AS build
RUN pnpm --filter @viberide/backend... build
# Prune to a standalone production directory. --legacy keeps the classic
# pnpm-deploy behaviour (this workspace does not use injected packages).
RUN pnpm --filter @viberide/backend --prod deploy --legacy /out

# ---- runtime: minimal non-root image ----
FROM node:24-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=app:app /out .
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/main.js"]
