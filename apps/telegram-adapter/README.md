# @viberide/telegram-adapter

Telegram Mini App (TWA) shell around the VibeRide game. It detects the Telegram
environment, boots the Mini App (viewport expand, theme binding, swipe locking),
persists saves to Telegram CloudStorage (with a localStorage fallback), maps
haptics, and hands a `PlatformAdapter` to the game embed from
`@viberide/web-game/embed`.

Outside Telegram (plain browser) it renders a dev-notice banner and runs the
game against a localStorage-backed fallback platform, so `pnpm dev` works with
no Telegram client at all.

## Local development

```bash
pnpm install
pnpm --filter @viberide/telegram-adapter dev   # http://localhost:5174
pnpm --filter @viberide/telegram-adapter test  # vitest + coverage
pnpm --filter @viberide/telegram-adapter build # dist/
```

Copy `.env.example` to `.env.local` and adjust values. All `VITE_*` variables
are inlined at build time.

## BotFather setup walkthrough

You need a bot and a Mini App registered with [@BotFather](https://t.me/BotFather).

### 1. Create the bot — `/newbot`

1. Open a chat with `@BotFather` and send `/newbot`.
2. Choose a display name (e.g. `VibeRide`) and a unique username ending in
   `bot` (e.g. `viberide_game_bot`).
3. BotFather replies with the **bot token**.
   TODO(manual): store this token as the `TELEGRAM_BOT_TOKEN` secret of the
   backend deployment. It is never used by this frontend — initData validation
   happens server-side (see below).

### 2. Register the Mini App — `/newapp`

1. Send `/newapp` and select your bot.
2. Provide a title and a short description.
3. Upload a 640x360 px photo (and optionally a demo GIF).
4. **Web App URL**: enter the HTTPS URL where this app is deployed.
   TODO(manual): point this at your staging URL (e.g.
   `https://tg.staging.example.com`). Telegram requires valid HTTPS — plain
   HTTP or self-signed certificates are rejected.
5. Choose a short name — the app becomes available at
   `https://t.me/<bot_username>/<short_name>`.

### 3. Configure the menu button

Either send `/setmenubutton`, pick the bot and paste the same Web App URL, or
use `/mybots` → _your bot_ → **Bot Settings** → **Menu Button** → **Configure
menu button**. The game then opens from the attachment/menu button in any chat
with the bot.

### 4. Test it

- **Mobile**: open `https://t.me/<bot_username>/<short_name>` on a phone with
  Telegram installed; the Mini App opens full screen.
- **Telegram Desktop**: enable _Settings → Advanced → Experimental settings →
  Enable webview inspecting_, then right-click inside the opened Mini App and
  choose _Inspect_ for full Chrome/Edge DevTools against the running app.
- **Plain browser**: `pnpm dev` and open `http://localhost:5174` — the adapter
  shows the "Running outside Telegram" banner and uses the local fallback
  platform, which is enough for gameplay iteration.

To test against a not-yet-public URL, BotFather also accepts
`http://127.0.0.1` URLs inside Telegram's _test environment_; for the regular
environment use an HTTPS tunnel (e.g. `ngrok http 5174`) and set it as the Web
App URL of a scratch bot.

### initData validation (server-side)

Inside Telegram the adapter sends the **raw initData string**
(`PlatformAdapter.getAuthPayload()`) to the backend with API requests. The
backend must validate the HMAC-SHA-256 signature of that string using
`TELEGRAM_BOT_TOKEN` before trusting any identity claims in it. The token and
the validation logic live exclusively in `apps/backend` — this app never sees
the bot token.

## Environment variables

| Variable                       | Purpose                                             |
| ------------------------------ | --------------------------------------------------- |
| `VITE_API_BASE_URL`            | Backend API origin (empty = same origin)            |
| `VITE_FEATURE_TON`             | Master switch for TON wallet functionality          |
| `VITE_FEATURE_NFT_SKINS`       | NFT skins (requires TON)                            |
| `VITE_FEATURE_LEADERBOARD`     | Global leaderboard UI                               |
| `VITE_FEATURE_TELEGRAM`        | Telegram integration features inside the game       |
| `VITE_TONCONNECT_MANIFEST_URL` | Public URL of `tonconnect-manifest.json` (TON only) |

## Layout

```
src/
  main.ts                  # bootstrap: env detection → platform → createGame
  telegram/
    environment.ts         # isTelegramEnv()
    init.ts                # initTelegram(): mount, expand, theme CSS vars, ready
    platform.ts            # createTelegramPlatform(): PlatformAdapter
    cloud-storage.ts       # CloudStorage SaveStorage + supported/fallback factory
    local-storage.ts       # localStorage SaveStorage + web-like fallback platform
```
