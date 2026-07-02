# Contributing to VibeRide

## Dev workflow

1. Fork/branch off `main` (see branch naming below).
2. `pnpm install` (Node ≥ 20, pnpm 10 — `corepack enable` picks up the pinned version).
3. Make your change, colocating tests next to the code (`src/**/*.test.ts`).
4. Run the full gate locally: `pnpm ci` (= `lint` + `typecheck` + `test` + `build`).
5. Open a PR against `main` and fill in the checklist below.

Useful commands while iterating:

```bash
pnpm --filter @viberide/<pkg> test      # one package's tests + coverage
pnpm --filter @viberide/<pkg> dev       # one app's dev server
pnpm lint:fix && pnpm format:fix        # auto-fix style issues
```

## Branch & commit conventions

- **Branches**: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`,
  `refactor/<topic>` — short, kebab-case.
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

  ```
  <type>(<scope>): <imperative summary>
  ```

  Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `ci`, `build`. Scope is the
  package or app short name (`shared`, `audio-engine`, `track-generator`, `ton`, `web-game`,
  `backend`, `telegram-adapter`, `infra`). Examples:

  - `feat(track-generator): cap gap width by boost-free jump distance`
  - `fix(backend): reject checkpoints with non-monotonic ticks`
  - `docs(api): document 422 anti-cheat envelope`

  Breaking contract changes (anything in `packages/shared/src/constants.ts`, event payloads, zod
  schemas, `BeatMap`/`LevelDefinition` shapes) use `!` and a `BREAKING CHANGE:` footer.

## Quality gates (CI fails otherwise)

| Gate   | Command          | Requirement                                                                          |
| ------ | ---------------- | ------------------------------------------------------------------------------------ |
| Lint   | `pnpm lint`      | Zero warnings (`--max-warnings 0`), single root flat ESLint config                   |
| Format | `pnpm format`    | Prettier clean (single quotes, semicolons, width 100, LF)                            |
| Types  | `pnpm typecheck` | `tsc --noEmit` per package, strict + `noUncheckedIndexedAccess`                      |
| Tests  | `pnpm test`      | Vitest per package, **coverage ≥ 80/80/80/80** (lines/functions/branches/statements) |
| Build  | `pnpm build`     | tsup (libraries) / app builds succeed                                                |

Non-negotiable code rules (enforced by the root `eslint.config.mjs` — do **not** add per-package
ESLint configs or edit the root config in a feature PR):

- No `console.*` — use the `Logger` from `@viberide/shared` (`createConsoleLogger`, `noopLogger`,
  or an injected logger).
- No `any`, no non-null assertions outside tests, no `@ts-ignore`/`@ts-expect-error`.
- `import type` for type-only imports; prefix intentionally unused bindings with `_`.
- Every promise is `await`ed or explicitly `void`ed (`no-floating-promises`).
- No `eslint-disable` except where a browser API genuinely forces it — then a scoped disable with
  a justification comment (see `packages/shared/src/logging/logger.ts` for the pattern).
- No `TODO` comments except `TODO(manual):` markers for things requiring real credentials or
  infrastructure (tokens, wallet addresses, domains).

## Adding a new package

Model everything on `packages/shared` — it is the reference layout.

1. **Scaffold** `packages/<name>/` with:
   - `package.json`: name `@viberide/<name>`, `version: 0.1.0`, `private: true`,
     `license: MIT`, `type: module`, `sideEffects: false`, the exact `exports` map from
     `packages/shared/package.json` (`types` / `import` / `require` → `dist/*`), `files: ["dist"]`
     and scripts `build: tsup`, `typecheck: tsc --noEmit`, `test: vitest run --coverage`.
   - devDependencies: `tsup ^8.4.0`, `typescript ^5.8.3`, `vitest ^3.1.4`,
     `@vitest/coverage-v8 ^3.1.4`. Workspace deps as `"@viberide/shared": "workspace:*"`.
   - `tsup.config.ts`: entry `src/index.ts`, `format: ['esm', 'cjs']`, `dts: true`,
     `sourcemap: true`, `clean: true`, `target: 'es2022'`.
   - `tsconfig.json` extending `../../tsconfig.base.json`. **Critical**: the `include` must cover
     _every_ `.ts` file in the package — including `tsup.config.ts` and `vitest.config.ts` — or
     the root ESLint `projectService` errors on uncovered files.
   - `vitest.config.ts`: v8 coverage provider, thresholds 80/80/80/80, tests colocated as
     `src/**/*.test.ts`. Coverage may exclude only: test files, re-export barrels (`index.ts`),
     pure type files, and thin browser-API glue — **each exclusion documented with a comment** in
     the config (see `packages/audio-engine/vitest.config.ts` for the expected style).
2. **Write real tests.** Genuine assertions on behaviour, not smoke tests. Deterministic code
   (PRNG, DSP, generation) should be tested for exact reproducibility (same input → deep-equal
   output).
3. **Wire it into turbo** — nothing to do: `pnpm-workspace.yaml` already globs `packages/*`, and
   `turbo.json` task definitions apply to any package exposing the standard scripts.

## Respecting the EventBus contracts

Client modules communicate **only** through `GameEventMap` events
(`packages/shared/src/events/game-events.ts`) — never by importing each other.

- To make modules interact, subscribe/emit on the shared `GameEventBus`
  (`createGameEventBus`), using the existing vocabulary where possible.
- Adding an event = extending `GameEventMap` in `@viberide/shared` (typed payload, doc comment
  naming emitter and consumers) + updating the event table in
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Adding events is non-breaking; changing or
  removing a payload is breaking (see commit conventions).
- Handlers must be side-effect safe: the bus catches handler errors and routes them to
  `onHandlerError`, but a handler must never assume ordering relative to other subscribers.
- Never put non-serializable values (DOM nodes, class instances with methods) in event payloads —
  payloads are data contracts.
- Changes to `packages/shared/src/constants.ts` alter simulation determinism and therefore
  anti-cheat validation: bump `BeatMap.version` / `LevelDefinition.version` and call it out in the
  PR description.

## PR checklist

Copy into your PR description and tick:

- [ ] `pnpm ci` passes locally (lint, typecheck, tests with ≥ 80% coverage, build).
- [ ] `pnpm format` clean.
- [ ] Conventional Commit messages; breaking contract changes flagged with `!`.
- [ ] New/changed behaviour covered by real tests (not smoke tests).
- [ ] No `console.*`, no `any`, no unjustified `eslint-disable`, no stray `TODO`s
      (only `TODO(manual):` where real credentials/infra are required).
- [ ] Every new `.ts` file is covered by a tsconfig `include`.
- [ ] Shared contracts (events, schemas, constants) changes: versions bumped, docs updated
      ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/API.md](docs/API.md),
      [docs/openapi.yaml](docs/openapi.yaml)).
- [ ] Security-relevant changes reviewed against [docs/SECURITY.md](docs/SECURITY.md).
- [ ] [CHANGELOG.md](CHANGELOG.md) updated under `[Unreleased]`.
