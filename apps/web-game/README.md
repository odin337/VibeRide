# @viberide/web-game

The playable VibeRide browser game: drop an mp3/ogg (or hit **Play demo track**), the audio
engine turns it into a `BeatMap`, the track generator carves a deterministic level from it, and a
fixed-step simulation rides it — PixiJS renders, React drives the UI shell.

## Layout

| Path            | Role                                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| `src/engine/`   | Pure deterministic core: physics, FSM, run controller (the unit-test surface)   |
| `src/input/`    | Keyboard / pointer / gamepad → `ActionState` (+ pure mapping helpers)           |
| `src/render/`   | PixiJS glue: terrain, entities, procedural car, parallax, beat pulse            |
| `src/audio/`    | Playback + beat scheduler + synthesized SFX (pure parts split out and tested)   |
| `src/api/`      | Typed backend client (Result-style, zod-validated), auth session, submit flow   |
| `src/app/`      | React screens and the `GameController` orchestrator (all ports injected)        |
| `src/platform/` | `PlatformAdapter` for the standalone web build                                  |
| `src/embed.tsx` | `createGame(container, { platform, apiBaseUrl?, flags? })` — the embed contract |

## Commands

```bash
pnpm dev        # vite dev server on :5173
pnpm build      # production build to dist/
pnpm preview    # serve the build on :4173
pnpm test       # vitest + coverage (jsdom)
pnpm test:e2e   # playwright against the preview build (chromium)
```

## Embedding

```ts
import { createGame } from '@viberide/web-game/embed';

const handle = createGame(document.getElementById('root'), {
  platform, // PlatformAdapter (web or Telegram)
  apiBaseUrl: 'http://localhost:3000',
  flags: { tonEnabled: false }, // overrides on top of VITE_FEATURE_*
});
handle.destroy();
```

Configuration lives in `.env` (see [.env.example](./.env.example)). The TON Connect manifest in
`public/tonconnect-manifest.json` carries `TODO(manual)` placeholders until a production domain
exists.
