# VibeRide Setup Guide

## Prerequisites

| Tool    | Version               | Notes                                                            |
| ------- | --------------------- | ---------------------------------------------------------------- |
| Node.js | ≥ 20 (24 recommended) | WebCrypto (`crypto.subtle`) without flags is required            |
| pnpm    | 10.x                  | Pinned via `packageManager` in the root `package.json`           |
| Docker  | optional              | Only needed for the compose-based full-stack run and prod images |
| Git     | any recent            | The repo enforces LF endings via `.gitattributes`/Prettier       |

Install pnpm via corepack so the pinned version is used automatically:

```bash
corepack enable
corepack prepare pnpm@10 --activate
```

## Clone, install, run

```bash
git clone <repo-url> VibeRide
cd VibeRide
pnpm install
pnpm dev          # turbo run dev — starts every app with a dev task
```

Dev servers (defaults):

| App                     | URL                     | Notes                                                     |
| ----------------------- | ----------------------- | --------------------------------------------------------- |
| `apps/web-game`         | `http://localhost:5173` | Plain browser game (Vite)                                 |
| `apps/telegram-adapter` | `http://localhost:5174` | TWA shell; outside Telegram it runs with a local fallback |
| `apps/backend`          | `http://localhost:3000` | REST API (`/health`, `/api/...`)                          |

Run a single app instead of everything:

```bash
pnpm --filter @viberide/web-game dev
pnpm --filter @viberide/telegram-adapter dev
pnpm --filter @viberide/backend dev
```

Each app reads environment variables from `.env.local` (frontends, Vite convention) or `.env`
(backend). Copy the app's `.env.example` and adjust — `.env*` files are gitignored except the
examples.

## Environment variables

The `.env.example` file inside each app is the authoritative list; the tables below mirror them.
All `VITE_*` values are **inlined at build time** — rebuild after changing them.

### `apps/web-game`

| Variable                       | Default                 | Required | Description                                               |
| ------------------------------ | ----------------------- | -------- | --------------------------------------------------------- |
| `VITE_API_BASE_URL`            | `http://localhost:3000` | no       | Backend API origin; leave empty for same-origin requests  |
| `VITE_FEATURE_TON`             | `false`                 | no       | Master switch for TON wallet functionality                |
| `VITE_FEATURE_NFT_SKINS`       | `false`                 | no       | NFT skins (forced off unless TON is enabled)              |
| `VITE_FEATURE_LEADERBOARD`     | `true`                  | no       | Score submission + leaderboard UI                         |
| `VITE_FEATURE_TELEGRAM`        | `false`                 | no       | Telegram integration features inside the game             |
| `VITE_TONCONNECT_MANIFEST_URL` | (empty)                 | TON only | Public HTTPS URL of the hosted `tonconnect-manifest.json` |

### `apps/telegram-adapter`

Same variables as `apps/web-game`, with `VITE_FEATURE_TELEGRAM=true` by default:

| Variable                       | Default                 | Required | Description                                               |
| ------------------------------ | ----------------------- | -------- | --------------------------------------------------------- |
| `VITE_API_BASE_URL`            | `http://localhost:3000` | no       | Backend API origin; leave empty for same-origin requests  |
| `VITE_FEATURE_TON`             | `false`                 | no       | Master switch for TON wallet functionality                |
| `VITE_FEATURE_NFT_SKINS`       | `false`                 | no       | NFT skins (forced off unless TON is enabled)              |
| `VITE_FEATURE_LEADERBOARD`     | `true`                  | no       | Score submission + leaderboard UI                         |
| `VITE_FEATURE_TELEGRAM`        | `true`                  | no       | Telegram integration features inside the game             |
| `VITE_TONCONNECT_MANIFEST_URL` | (empty)                 | TON only | Public HTTPS URL of the hosted `tonconnect-manifest.json` |

### `apps/backend`

| Variable              | Default                                       | Required      | Description                                                                          |
| --------------------- | --------------------------------------------- | ------------- | ------------------------------------------------------------------------------------ |
| `PORT`                | `3000`                                        | no            | HTTP listen port                                                                     |
| `NODE_ENV`            | `development`                                 | no            | `development` / `production` / `test`                                                |
| `LOG_LEVEL`           | `info`                                        | no            | Minimum log level (`debug` / `info` / `warn` / `error`)                              |
| `JWT_SECRET`          | —                                             | **yes**       | HMAC secret for session JWTs. TODO(manual): generate a strong random value           |
| `JWT_EXPIRES_IN`      | `3600`                                        | no            | Session token lifetime, seconds                                                      |
| `TELEGRAM_BOT_TOKEN`  | —                                             | Telegram auth | Bot token from @BotFather; used **only** server-side for initData HMAC. TODO(manual) |
| `CORS_ORIGINS`        | `http://localhost:5173,http://localhost:5174` | no            | Comma-separated allowed origins                                                      |
| `THROTTLE_TTL_SEC`    | `60`                                          | no            | Rate-limit window, seconds                                                           |
| `THROTTLE_LIMIT`      | `60`                                          | no            | Requests per window per client (auth/scores routes have stricter overrides)          |
| `FEATURE_TON`         | `false`                                       | no            | Server-side feature flag (see `resolveFeatureFlags`)                                 |
| `FEATURE_NFT_SKINS`   | `false`                                       | no            | Server-side feature flag                                                             |
| `FEATURE_LEADERBOARD` | `true`                                        | no            | Enables the leaderboard/scores endpoints                                             |
| `FEATURE_TELEGRAM`    | `false`                                       | no            | Enables the Telegram auth path                                                       |

## Tests, lint, typecheck, build

```bash
pnpm test        # turbo run test — vitest run --coverage in every package (80% thresholds)
pnpm test:e2e    # Playwright e2e suites (apps that define them)
pnpm lint        # eslint . --max-warnings 0 (single root flat config)
pnpm lint:fix    # same with --fix
pnpm typecheck   # tsc --noEmit per package
pnpm format      # prettier --check .
pnpm format:fix  # prettier --write .
pnpm build       # turbo run build (tsup for libraries, vite/nest build for apps)
pnpm audit:deps  # pnpm audit --audit-level=high
pnpm ci          # lint + typecheck + test + build, same as CI
```

Scope any of these to one package with `pnpm --filter <name> <script>`, e.g.
`pnpm --filter @viberide/audio-engine test`.

Coverage thresholds (lines/functions/branches/statements = 80) are enforced per package by
Vitest; a package failing thresholds fails `pnpm test`.

## Docker

Production images and a compose file live at the repository root / `infra` directory:

```bash
docker compose up --build     # build and start backend + static frontends behind nginx
docker compose down
```

The compose setup mirrors staging: the backend runs as a non-root user, frontends are static
builds served by nginx with the security headers described in
[docs/SECURITY.md](./SECURITY.md). Environment variables come from your local `.env` files — the
compose file never contains secrets. Check the compose file itself for the authoritative service
list and ports.

## Telegram Mini App setup (BotFather walkthrough)

You need a bot and a Mini App registered with [@BotFather](https://t.me/BotFather).

1. **Create the bot** — send `/newbot` to @BotFather, choose a display name (e.g. `VibeRide`) and
   a unique username ending in `bot` (e.g. `viberide_game_bot`). BotFather replies with the
   **bot token**.
   - TODO(manual): store the token as the `TELEGRAM_BOT_TOKEN` secret of the **backend**
     deployment. The frontends never see it — initData validation is server-side only.
2. **Register the Mini App** — send `/newapp`, select your bot, provide title/description and a
   640×360 px photo. For **Web App URL** enter the HTTPS URL where `apps/telegram-adapter` is
   deployed.
   - Telegram requires valid **HTTPS** — plain HTTP or self-signed certificates are rejected.
   - TODO(manual): point this at your staging URL once it exists.
   - Choose a short name; the app becomes available at `https://t.me/<bot_username>/<short_name>`.
3. **Menu button** — `/setmenubutton` (or `/mybots` → Bot Settings → Menu Button) with the same
   Web App URL, so the game opens from the chat menu button.
4. **Local testing without a public URL** — run `pnpm --filter @viberide/telegram-adapter dev` and
   open `http://localhost:5174` in a plain browser: the adapter detects it is outside Telegram and
   runs on a localStorage fallback platform. To test inside real Telegram, expose the dev server
   through an HTTPS tunnel (e.g. `ngrok http 5174`) and set the tunnel URL as the Web App URL of a
   scratch bot. On Telegram Desktop, enable _Settings → Advanced → Experimental settings → Enable
   webview inspecting_ for DevTools inside the Mini App.

The adapter sends the **raw initData string** to the backend as its auth payload
(`PlatformAdapter.getAuthPayload()`); the backend validates its HMAC-SHA-256 signature with
`TELEGRAM_BOT_TOKEN` before trusting any identity claims (see
[docs/SECURITY.md](./SECURITY.md)).

## TON testnet setup

All TON functionality is off by default (`VITE_FEATURE_TON=false`) — the game runs fully without
any of this. To develop the TON integration:

1. **Wallet in testnet mode** — install [Tonkeeper](https://tonkeeper.com/), open _Settings_, tap
   the Tonkeeper icon/version at the bottom five times to reveal the dev menu, and enable
   **Testnet**. (Other TON Connect wallets have equivalent switches.)
2. **Fund the wallet** — message [@testgiver_ton_bot](https://t.me/testgiver_ton_bot) on Telegram
   and request testnet TON to your testnet address. Testnet coins have no value and arrive within
   a minute.
3. **Host the TON Connect manifest** — wallets fetch a public JSON manifest describing your app.
   Copy `packages/ton-sdk-wrapper/assets/tonconnect-manifest.example.json`, replace the
   placeholder URLs, and serve it **publicly over HTTPS without authentication** at e.g.
   `https://<your-domain>/tonconnect-manifest.json`. Set `VITE_TONCONNECT_MANIFEST_URL` to that
   URL in both frontends.
4. **Enable the flags** — set `VITE_FEATURE_TON=true` (and optionally
   `VITE_FEATURE_NFT_SKINS=true`) in `.env.local` and restart the dev server. `createTonModule`
   then binds the real TON Connect module with `network: 'testnet'`. For unit tests and offline
   dev, pass `kind: 'mock'` to get the in-memory `MockTonModule`.

### TODO(manual) checklist — real credentials and infrastructure

These cannot be generated and must be provisioned by a human before the corresponding feature
works outside local dev:

- [ ] TODO(manual): `TELEGRAM_BOT_TOKEN` — from @BotFather, backend secret store only.
- [ ] TODO(manual): BotFather **Web App URL** — public HTTPS domain for the deployed
      telegram-adapter.
- [ ] TODO(manual): production domain in `tonconnect-manifest.json` (`url`, `iconUrl`) and the
      hosted manifest URL in `VITE_TONCONNECT_MANIFEST_URL`.
- [ ] TODO(manual): deployed NFT skin collection address →
      `TonModuleConfig.skinCollectionAddress` (see `packages/ton-sdk-wrapper/src/nft-indexer.ts`).
- [ ] TODO(manual): TonAPI key (anonymous access is heavily rate limited) wired via an env var
      (e.g. `VITE_TONAPI_KEY`) before enabling NFT skins in production.
- [ ] TODO(manual): `JWT_SECRET` — strong random value per environment, never committed.

## Troubleshooting

- **`pnpm install` warns about build scripts** — only `esbuild`, `@swc/core`, `@nestjs/core` and
  `unrs-resolver` are allowed to run postinstall scripts (`onlyBuiltDependencies` in
  `pnpm-workspace.yaml`); anything else is intentionally blocked.
- **ESLint errors about "file not included in any tsconfig"** — every `.ts` file (including
  `vitest.config.ts` etc.) must be covered by its package's tsconfig `include`; see
  [CONTRIBUTING.md](../CONTRIBUTING.md).
- **Windows line endings** — Prettier enforces LF; configure `git config core.autocrlf input` if
  you see whole-file diffs.
