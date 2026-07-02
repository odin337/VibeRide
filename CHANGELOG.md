# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-02

Initial release of the VibeRide monorepo: a music-driven racing game shipped as a web game and a
Telegram Mini App, with optional TON integration behind feature flags.

### Added

- **Monorepo tooling**: pnpm 10 workspaces + Turborepo pipeline (`build` / `dev` / `typecheck` /
  `test` / `test:e2e`), single root ESLint flat config (typescript-eslint `strictTypeChecked` +
  `eslint-plugin-security`, `no-console` everywhere), Prettier, strict TypeScript base config with
  `noUncheckedIndexedAccess`, per-package Vitest with v8 coverage and 80/80/80/80 thresholds.
- **`@viberide/shared`** — the contract package: domain types (`BeatMap`, `LevelDefinition`,
  `RunResult`, leaderboard/platform/TON types), typed synchronous `EventBus` with the
  `GameEventMap` vocabulary connecting all modules, zod API schemas shared by backend and clients,
  simulation constants (60 Hz fixed step, gravity, player physics, checkpoint interval),
  deterministic utilities (mulberry32 PRNG, FNV-1a `seedFromHash`, WebCrypto `sha256Hex`),
  environment-driven feature flags (TON / NFT skins / leaderboard / Telegram) and a structured
  JSON `Logger` abstraction.
- **`@viberide/audio-engine`** — deterministic audio analysis: browser decode glue pinned to
  44.1 kHz mono (`OfflineAudioContext`), radix-2 real FFT, Hann-windowed STFT with per-band
  (bass/mid/high) half-wave-rectified spectral flux, adaptive-threshold onset detection,
  autocorrelation tempo estimation (60–200 BPM, octave correction toward 90–180, parabolic
  refinement), onset-phased beat grid, RMS energy envelope, and zod-validated BeatMap
  serialization — same audio bytes always produce a deep-equal `BeatMap`.
- **`@viberide/track-generator`** — deterministic `BeatMap` → `LevelDefinition` conversion:
  seed derived solely from the audio hash, independent salted PRNG streams per subsystem,
  energy-modulated multi-octave value-noise terrain with slope clamping and flat spawn,
  bass-onset-driven obstacles sized by a jump-physics envelope so every layout is clearable
  without boost, mid/high-onset note arcs and gems, `maxScore` invariant
  (collectibles + finish bonus), plus `validatePlayability` re-checking every generation
  invariant and zod-validated level IO for anti-cheat regeneration.
- **`@viberide/ton-sdk-wrapper`** — all TON functionality behind a single `TonModule` interface:
  lazily-loaded TON Connect wallet sessions, `@ton/core` payload builders (comment, TEP-74 jetton
  transfer, TEP-62 NFT transfer, skin mint request with expiry), TonAPI NFT skin lookup with
  zod-validated responses, typed error hierarchy, and `disabled` / `mock` implementations so the
  game runs with crypto fully off and tests never touch a network.
- **`@viberide/web-game`** — browser game app: audio → analysis → generation → fixed-step
  simulation pipeline wired over the EventBus, renderer/input/UI modules, replay checkpoints for
  anti-cheat, and an embeddable `createGame` entry (`@viberide/web-game/embed`).
- **`@viberide/backend`** — NestJS REST API: Telegram `initData` HMAC-validated auth and guest
  auth issuing Bearer JWTs, track metadata registration, anti-cheat-validated score submission
  (seed derivation, level regeneration, checkpoint replay validation), per-track leaderboards,
  health/readiness probes, Prometheus metrics, helmet security headers, request throttling and
  structured pino logging behind the shared `Logger` interface.
- **`@viberide/telegram-adapter`** — Telegram Mini App shell: environment detection, TWA
  bootstrap (viewport expand, theme binding), CloudStorage-backed saves with localStorage
  fallback, haptic mapping, raw-initData auth payload pass-through, and a plain-browser fallback
  mode for local development.
- **Infrastructure**: Dockerfiles (non-root containers) and compose setup, CI pipeline (lint,
  typecheck, tests with coverage, build, `pnpm audit`, gitleaks secret scan, Trivy scanning) and
  deployment manifests.
- **Documentation**: architecture overview with module/event/determinism/anti-cheat design
  (`docs/ARCHITECTURE.md`), API reference (`docs/API.md`) with OpenAPI 3.1 spec
  (`docs/openapi.yaml`), setup guide covering env vars, BotFather and TON testnet walkthroughs
  (`docs/SETUP.md`), threat model and release security checklist (`docs/SECURITY.md`),
  contribution guide (`CONTRIBUTING.md`).

[0.1.0]: https://github.com/viberide/viberide/releases/tag/v0.1.0
