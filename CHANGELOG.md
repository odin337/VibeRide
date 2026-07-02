# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-07-02

The music-lock release: the world, the rider and every sound are now provably on the track's
clock (Hill Climb Racing body × Piano Tiles soul × Geometry Dash pulse).

### Added

- **Music-master clock**: the simulation follows the latency-compensated Web Audio playhead
  (`advanceToSongTime`); pausing suspends the AudioContext and freezes the world with the music;
  wall-clock fallback for blocked/absent audio; auto-pause on tab hide.
- **Combo (Piano Tiles)**: consecutive collected notes build a ×1…×4 multiplier (HUD chip),
  lift the melody an octave, and unlock live arrangement layers on library tracks; a missed note
  (`game:noteMiss`) kills the combo and ducks the music.
- **Fever (reworked boost)**: no speed change — a pickup magnet (×2.5 reach), ×2 pickup score,
  and an opened low-pass filter with extra gain. Dive (lean back airborne) accelerates the fall
  to catch the next beat. New `game:landed` event with a quantized landing thump.
- **Track slicing**: crashing beat-repeats the last 1/8 of the actual track buffer, shrinking
  and slowing into a tape-stop (`crashStutterPlan`, pure + unit-tested); finishing sweeps the
  filter open and fades out.
- **Quantized SFX**: one shared AudioContext for music and SFX; jump/land/collect/miss one-shots
  snap to the track's 1/16 grid (`audio/grid.ts`, pure + unit-tested).
- **Pre-tuned track library** (`track-library.ts`): four deterministic compositions
  (Sunset Cruise 100 BPM, Neon Runner 128, Bass Hammer 150 double-kick hardcore,
  Midnight Drift 118) — each a BeatMap plus a live pattern-synth PatternSpec (kick/bass/hats/
  stabs) built from the same rhythm knobs; menu shows a card grid with BPM/length/difficulty.
- **NFT tracks**: library entries with `nftItemName` lock until the connected TON wallet owns
  the matching NFT item (`TonModule.getOwnedSkins`); mock/disabled modules keep the game fully
  playable without crypto.
- **Hill-Climb-style renderer**: cartoon jeep with spinning wheels, suspension squash on
  landing and air pitch; sky/sun/clouds/hills parallax; grass-topped dirt terrain with gap
  warning markers and a checkered finish flag; beat-pulsing background and collectibles;
  fever glow + exhaust; crash shake/vignette; note-miss stage dim; finish confetti
  (all reduced-motion-aware).

### Changed

- **BREAKING (replays)**: horizontal speed is now a simulation constant —
  `x = tick × SIM_DT × WORLD_SPEED_BASE` exactly; obstacles/notes are met at the precise moment
  they sound. `PLAYER.boostMultiplier` removed in favour of `feverMagnetMultiplier`/`diveAccel`.
  `LevelDefinition.maxScore` now equals collectible sum × `SCORE_CEILING_FACTOR` (8) +
  `FINISH_SCORE`.
- **Anti-cheat is exact**: every checkpoint must sit on the closed-form music-locked path
  (±1e-6 m) — the speed-ceiling heuristic is gone; per-interval score windows account for the
  fever magnet and combo ceiling; early crashes are no longer rejected by a minimum-duration
  bound (bug fix); runs cannot outlive the song.
- Menu screen redesigned around the track library; demo button replaced by track cards
  (e2e updated accordingly).

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
