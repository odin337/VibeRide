# syntax=docker/dockerfile:1
# VibeRide Telegram Mini App — static Vite build served by unprivileged nginx
# (port 8080). Build from the REPO ROOT so the whole workspace is in the context:
#   docker build -f apps/telegram-adapter/Dockerfile .

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

# ---- build: VITE_* values are inlined into the bundle at build time ----
FROM deps AS build
ARG VITE_API_BASE_URL=""
ARG VITE_FEATURE_TON="false"
ARG VITE_FEATURE_NFT_SKINS="false"
ARG VITE_FEATURE_LEADERBOARD="true"
ARG VITE_FEATURE_TELEGRAM="true"
ARG VITE_TONCONNECT_MANIFEST_URL=""
ENV VITE_API_BASE_URL="${VITE_API_BASE_URL}"
ENV VITE_FEATURE_TON="${VITE_FEATURE_TON}"
ENV VITE_FEATURE_NFT_SKINS="${VITE_FEATURE_NFT_SKINS}"
ENV VITE_FEATURE_LEADERBOARD="${VITE_FEATURE_LEADERBOARD}"
ENV VITE_FEATURE_TELEGRAM="${VITE_FEATURE_TELEGRAM}"
ENV VITE_TONCONNECT_MANIFEST_URL="${VITE_TONCONNECT_MANIFEST_URL}"
RUN pnpm --filter @viberide/telegram-adapter... build

# ---- runtime: unprivileged nginx (runs as uid 101, listens on 8080) ----
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
# Extra origins the browser may contact. With TON enabled this must include the
# TON endpoints, e.g.: "https://tonapi.io https://bridge.tonapi.io wss://bridge.tonapi.io".
# Overridable at container start as well — the config is rendered from the
# template by the image's envsubst entrypoint.
ARG CSP_CONNECT_SRC=""
ENV CSP_CONNECT_SRC="${CSP_CONNECT_SRC}"
COPY apps/telegram-adapter/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/telegram-adapter/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
