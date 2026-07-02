# VibeRide

**EN:** VibeRide is a music-driven racing game (Hill Climb Racing × Piano Tiles × Geometry Dash)
shipped as a web game and a Telegram Mini App with optional TON integration.

**RU:** VibeRide — музыкальная гоночная игра (Hill Climb Racing × Piano Tiles × Geometry Dash),
доступная как веб-игра и Telegram Mini App с опциональной интеграцией TON.

<!-- TODO(manual): replace OWNER/REPO in the badge URLs once the GitHub repo exists. -->

[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

## Quickstart

Requirements: Node.js >= 20 (24 recommended), pnpm 10 (`corepack enable`), optionally Docker.

```bash
pnpm install          # install the whole workspace
pnpm dev              # all apps in watch mode (turbo)
pnpm test             # unit tests + coverage (vitest)
pnpm lint             # eslint (single root flat config)
pnpm typecheck        # tsc --noEmit across the workspace
pnpm build            # production builds (turbo)
```

Dev servers: backend `http://localhost:3000`, web game `http://localhost:5173`,
Telegram adapter `http://localhost:5174`.

Full stack via Docker (copy `.env.example` to `.env` first):

```bash
docker compose up --build
# backend http://localhost:3000 · web game http://localhost:8080 · TWA http://localhost:8081
```

## Repository structure

| Path                       | Package                      | Description                                            |
| -------------------------- | ---------------------------- | ------------------------------------------------------ |
| `apps/web-game`            | `@viberide/web-game`         | The game client (Vite) + embeddable `/embed` entry     |
| `apps/telegram-adapter`    | `@viberide/telegram-adapter` | Telegram Mini App shell (TWA bootstrap, CloudStorage)  |
| `apps/backend`             | `@viberide/backend`          | NestJS API: auth, leaderboard, anti-cheat validation   |
| `packages/shared`          | `@viberide/shared`           | Domain types, EventBus, zod schemas, PRNG/hash, Logger |
| `packages/audio-engine`    | `@viberide/audio-engine`     | Music analysis (DSP) and beatmap generation            |
| `packages/track-generator` | `@viberide/track-generator`  | Deterministic track/level generation from beatmaps     |
| `packages/ton-sdk-wrapper` | `@viberide/ton-sdk-wrapper`  | TON Connect / payments wrapper behind feature flags    |
| `infra/k8s`                | —                            | Kubernetes manifests (deployments, ingress, HPA)       |
| `.github/workflows`        | —                            | CI/CD: quality gates, e2e, security scans, deploys     |
| `docs`                     | —                            | Project documentation (see below)                      |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — modules, event bus, data flow, determinism & anti-cheat design
- [API reference](docs/API.md) — every backend endpoint ([OpenAPI 3.1 spec](docs/openapi.yaml))
- [Setup](docs/SETUP.md) — local development, environment variables, BotFather and TON testnet walkthroughs
- [Security](docs/SECURITY.md) — threat model, mitigations, release checklist
- [Contributing](CONTRIBUTING.md) — workflow, quality gates, module recipes

## CI/CD in one paragraph

Every push runs lint/format/typecheck, unit tests with coverage, Playwright e2e,
dependency audit and a gitleaks secret scan. Merges to `main` additionally build
the three Docker images, scan them with Trivy (CRITICAL/HIGH fail the build),
push them to GHCR and auto-deploy to staging with health-checked rollback.
Production deploys are manual (`Deploy production` workflow, approval-gated)
with an explicit rollback path.

## License

MIT. The workspace packages are `"private": true` and are not published to npm.
