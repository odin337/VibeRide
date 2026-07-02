# VibeRide Security

Threat model, implemented mitigations and release checklist for the VibeRide monorepo.

## Threat model

| #   | Threat                                 | Vector                                                              | Mitigation                                                                                                                                                                                                                                                                                                                                              | Where it lives                                                                                                                                                                           |
| --- | -------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Spoofed Telegram identity**          | Attacker crafts/replays `initData` to impersonate a Telegram user   | HMAC-SHA-256 validation of the raw `initData` string with a key derived from the bot token, plus `auth_date` freshness check, **before** any identity claim is trusted. The bot token exists only in the backend environment — frontends pass the raw string through untouched                                                                          | Backend auth module (`apps/backend`, Telegram initData validator); adapter side: `apps/telegram-adapter/src/telegram/platform.ts` (`getAuthPayload` returns the raw string only)         |
| 2   | **Forged scores / replay tampering**   | Client submits inflated scores, chosen seeds, or edited checkpoints | Full server-side re-derivation: zod schema (`scoreSubmissionSchema`), seed check `seed === seedFromHash(audioHash)`, deterministic level regeneration (`generateLevel`) + `validatePlayability`, `score <= maxScore` invariant, checkpoint replay validation (tick alignment, monotonic score, kinematic bounds from shared constants). Rejection → 422 | `packages/shared/src/utils/hash.ts`, `packages/shared/src/constants.ts`, `packages/track-generator/src/{generator,playability,level-io}.ts`, backend anti-cheat service (`apps/backend`) |
| 3   | **XSS**                                | Injected markup via display names, track titles, NFT metadata       | No `innerHTML` with untrusted data — DOM is built via `createElement`/`textContent` (see `apps/telegram-adapter/src/main.ts`); zod length/shape limits on all user-supplied strings; CSP headers (`default-src 'self'`, no `unsafe-eval`) served by nginx for static frontends and helmet on the backend                                                | nginx config (infra), helmet in backend `main.ts`, shared zod schemas                                                                                                                    |
| 4   | **CSRF**                               | Cross-site requests riding on ambient credentials                   | The API is cookie-free: auth is an explicit `Authorization: Bearer` header that browsers never attach automatically; CORS restricted to the known frontend origins (`CORS_ORIGINS`)                                                                                                                                                                     | Backend bootstrap (CORS config), `docs/API.md` auth model                                                                                                                                |
| 5   | **Dependency supply chain**            | Malicious/compromised npm packages, typosquats, postinstall scripts | Pinned `packageManager` + lockfile; `pnpm-workspace.yaml` `onlyBuiltDependencies` allowlist blocks all other postinstall scripts; `pnpm audit --audit-level=high` (`pnpm audit:deps`) and Trivy image/filesystem scanning in CI; minimal dependency surface in library packages                                                                         | `pnpm-workspace.yaml`, root `package.json`, CI workflow (`.github/workflows/`)                                                                                                           |
| 6   | **Secrets leakage**                    | Tokens/keys committed to git or baked into client bundles           | `.gitignore` excludes every `.env*` except `.env.example`; gitleaks secret scanning in CI; the bot token and JWT secret exist only server-side; frontends receive only `VITE_*` values that are public by definition (feature flags, public URLs)                                                                                                       | `.gitignore`, CI gitleaks step, env conventions in `docs/SETUP.md`                                                                                                                       |
| 7   | **DoS / abuse**                        | Request floods, oversized payloads, submission spam                 | Global `@nestjs/throttler` (default 60 req/60 s) with stricter per-route limits on auth (10/60 s) and score submission (10/60 s); zod caps every payload (initData ≤ 8192 chars, ≤ 600 checkpoints, limit ≤ 100); JSON body-size limits; container resource limits in deployment                                                                        | Backend throttler config, `packages/shared/src/schemas/api.ts`, infra manifests                                                                                                          |
| 8   | **Malicious audio files**              | Crafted media exploiting decoder bugs or exhausting memory          | Audio is decoded **only in the browser sandbox** by the platform's codec stack (`OfflineAudioContext.decodeAudioData`) — the file never reaches the backend; only the derived `BeatMap`/hash/metadata cross the trust boundary, and those are zod-validated (`beatMapSchema`, `trackMetadataSchema`) with hard numeric ranges                           | `packages/audio-engine/src/browser/decode.ts`, `packages/audio-engine/src/beatmap-io.ts`                                                                                                 |
| 9   | **Tampered persisted levels/beatmaps** | Corrupted or hostile JSON in storage or transit                     | `parseBeatMap` / `parseLevel` reject anything violating the schema and strip unknown keys, so smuggled fields never survive a parse; playability re-validation catches semantic tampering                                                                                                                                                               | `packages/audio-engine/src/beatmap-io.ts`, `packages/track-generator/src/level-io.ts`                                                                                                    |
| 10  | **Container compromise escalation**    | Escape or lateral movement from a popped container                  | Images run as a non-root user, minimal base images, no secrets in images (env-injected at runtime), Trivy scanning in CI                                                                                                                                                                                                                                | Dockerfiles / compose / K8s manifests (infra)                                                                                                                                            |

## Defense-in-depth notes

- **zod at every boundary.** Anything crossing a trust boundary — HTTP bodies and queries,
  persisted JSON, third-party API responses (TonAPI in
  `packages/ton-sdk-wrapper/src/nft-indexer.ts`) — is parsed with a zod schema before use. Types
  alone are compile-time only; the schemas are the runtime enforcement.
- **Determinism as a security property.** Because level generation is a pure function of the
  audio hash, the server never has to trust a client-supplied level or seed — it re-derives them.
  See [docs/ARCHITECTURE.md](./ARCHITECTURE.md#determinism--anti-cheat).
- **No `console.*`, structured logs only.** ESLint denies `console` everywhere except the single
  sanctioned sink inside the shared logger; logs are JSON lines, which keeps log injection via
  user-controlled strings inert (values are JSON-encoded, never interpolated into log syntax).
- **TON safety.** All blockchain code sits behind `TonModule`; with `FEATURE_TON=false` the
  `DisabledTonModule` fails fast and no TON code path is ever exercised. Transaction payloads are
  built locally with `@ton/core` (`payloads.ts`) — the app never signs anything itself; signing
  happens in the user's wallet via TON Connect, and mint requests carry a 5-minute `validUntil`
  expiry.

## Deliberate ESLint trade-off: `security/detect-object-injection`

The root `eslint.config.mjs` enables `eslint-plugin-security` but **turns off**
`security/detect-object-injection`:

> Disabled: flags every computed member access (`arr[i]`) producing an unmanageable
> false-positive rate; object-injection risks are covered by strict typing and zod validation at
> all IO boundaries.

Rationale: the rule fires on every computed index — untenable in DSP/simulation code that is
dominated by typed-array loops. The actual risk the rule targets (attacker-controlled keys
reaching object lookups) is mitigated structurally instead: TypeScript `strict` +
`noUncheckedIndexedAccess` force handling of absent keys, external input never becomes an object
key before passing a zod schema with an explicit shape, and prototype-polluting keys are stripped
by zod's default unknown-key removal. Revisit this trade-off if the codebase ever starts indexing
objects with raw request data.

## Security checklist for releases

Before tagging a release:

- [ ] `pnpm ci` green (lint including `eslint-plugin-security`, typecheck, tests with coverage,
      build).
- [ ] `pnpm audit:deps` — no high/critical advisories (or documented, time-boxed exceptions).
- [ ] CI security jobs green: gitleaks (secret scan), Trivy (dependency + image scan).
- [ ] No new `eslint-disable` without a written justification comment.
- [ ] Diff review of `packages/shared/src/schemas/api.ts` and `constants.ts` — any change here is
      a contract/anti-cheat change; confirm version bumps (`BeatMap.version`,
      `LevelDefinition.version`) where required.
- [ ] `.env.example` files contain no real values; grep the diff for tokens/keys.
- [ ] Frontend bundles contain no server-side variables (search dist for `TELEGRAM_BOT_TOKEN`,
      `JWT_SECRET` — must be absent).
- [ ] CSP/security headers verified on the deployed staging environment (nginx + helmet).
- [ ] Rate limits verified against expected traffic; `/metrics` not publicly exposed.

## Responsible disclosure

We appreciate coordinated disclosure of vulnerabilities.

- Report privately — do **not** open a public issue for security findings.
  TODO(manual): publish a dedicated security contact (e.g. `security@<production-domain>`) and a
  `security.txt` once the production domain exists.
- Include reproduction steps, affected endpoints/packages and impact assessment.
- We aim to acknowledge reports within 72 hours and to ship a fix or mitigation within 30 days
  for high-severity issues.
- Please avoid testing against production leaderboards with real users; use a local or staging
  deployment.
