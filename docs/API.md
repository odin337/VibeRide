# VibeRide Backend API Reference

Human-readable reference for the `apps/backend` REST API. The machine-readable equivalent is
[docs/openapi.yaml](./openapi.yaml). All request/response bodies are JSON (`application/json`)
unless stated otherwise; all request bodies are validated with the zod schemas from
`@viberide/shared` (`packages/shared/src/schemas/api.ts`) — the schemas below are quoted from that
file, which is the single source of truth shared by the backend and both clients.

- **Base URL (local dev)**: `http://localhost:3000`
- **API prefix**: application endpoints live under `/api`; operational endpoints (`/health`,
  `/health/ready`, `/metrics`) are unprefixed.
- **Auth**: Bearer JWT (`Authorization: Bearer <token>`), obtained from one of the auth endpoints.
- **Rate limiting**: global `@nestjs/throttler` limit of 60 requests / 60 s per client
  (configurable via `THROTTLE_LIMIT` / `THROTTLE_TTL_SEC`), with stricter per-route overrides
  listed per endpoint. Exceeding a limit returns `429`.

## Conventions

### `audioHash`

Everywhere below, `audioHash` is the lowercase SHA-256 hex digest (64 chars, `^[0-9a-f]{64}$`) of
the **original encoded audio bytes** — the track's identity across analysis, generation and
leaderboards.

### Error envelope

Errors use the standard NestJS envelope. `message` is a string, or an array of strings for
validation failures (one entry per zod issue, `path: message`):

```json
{
  "statusCode": 400,
  "message": ["audioHash: must be a lowercase sha-256 hex digest"],
  "error": "Bad Request"
}
```

Status codes used across the API:

| Status | Meaning                                                                        |
| ------ | ------------------------------------------------------------------------------ |
| 400    | Request body/query failed zod validation                                       |
| 401    | Missing/invalid/expired Bearer token, or invalid Telegram `initData` signature |
| 404    | Resource not found (unknown `audioHash` where the resource is required)        |
| 409    | Conflict (re-registering a track with different metadata)                      |
| 422    | Score submission rejected by anti-cheat validation                             |
| 429    | Rate limit exceeded                                                            |
| 500    | Unexpected server error (no internals leaked)                                  |
| 503    | Not ready (readiness probe only)                                               |

---

## Operational endpoints

### `GET /health`

Liveness probe. No auth, exempt from throttling.

**Response `200`:**

```json
{ "status": "ok" }
```

### `GET /health/ready`

Readiness probe — verifies the app's dependencies are reachable. No auth, exempt from throttling.

**Response `200`:** `{ "status": "ok" }`
**Response `503`:** `{ "status": "error" }` — not ready to receive traffic.

### `GET /metrics`

Prometheus metrics in text exposition format (`text/plain; version=0.0.4`). No auth at the app
level — restrict at the ingress/network layer in production (see
[docs/SECURITY.md](./SECURITY.md)).

```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="POST",path="/api/scores",status="201"} 42
```

---

## Auth

Both auth endpoints issue a signed JWT. Send it on subsequent requests as
`Authorization: Bearer <token>`. Token lifetime is controlled by `JWT_EXPIRES_IN` (backend env).

### `POST /api/auth/telegram`

Exchanges a Telegram Mini App `initData` string for a session token. The backend recomputes the
HMAC-SHA-256 signature of `initData` using the secret key derived from `TELEGRAM_BOT_TOKEN`
(per the [Telegram Mini Apps spec](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app))
and rejects stale `auth_date` values. Identity claims inside `initData` are only trusted **after**
the signature check.

- **Auth**: none (this endpoint issues the token)
- **Throttle**: 10 requests / 60 s

**Request** (`telegramAuthRequestSchema`): `initData` — non-empty string, max 8192 chars.

```json
{
  "initData": "query_id=AAH…&user=%7B%22id%22%3A12345%7D&auth_date=1751443200&hash=abc123…"
}
```

**Response `201`:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…",
  "player": {
    "id": "tg:12345",
    "displayName": "Danila",
    "kind": "telegram"
  }
}
```

**Errors:** `400` (schema violation, e.g. empty or oversized `initData`), `401` (signature
mismatch or expired `auth_date`), `429`.

### `POST /api/auth/guest`

Creates or resumes a guest session bound to a client-generated device UUID. Used by the plain web
game where no Telegram identity exists.

- **Auth**: none
- **Throttle**: 10 requests / 60 s

**Request** (`guestAuthRequestSchema`): `deviceId` — UUID; `displayName` — trimmed, 1–64 chars.

```json
{
  "deviceId": "3f6f2f04-8c2d-4d5e-9b1a-7c0a4a1b2c3d",
  "displayName": "RoadRunner"
}
```

**Response `201`:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…",
  "player": {
    "id": "guest:3f6f2f04-8c2d-4d5e-9b1a-7c0a4a1b2c3d",
    "displayName": "RoadRunner",
    "kind": "guest"
  }
}
```

**Errors:** `400` (invalid UUID, empty/oversized display name), `429`.

---

## Tracks

### `POST /api/tracks`

Registers metadata for an analyzed track so the backend can attach leaderboards to it. Idempotent
for identical payloads; conflicting metadata for an already-registered `audioHash` is rejected.

- **Auth**: Bearer JWT required
- **Throttle**: global default (60 / 60 s)

**Request** (`trackMetadataSchema`):

```json
{
  "audioHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "title": "Night Drive",
  "durationSec": 180.5,
  "bpm": 128
}
```

Constraints: `title` trimmed 1–200 chars, `durationSec` positive finite, `bpm` in [40, 300].

**Response `201`:** echoes the stored metadata (same shape as the request).

**Errors:** `400`, `401`, `409` (same `audioHash`, different metadata), `429`.

### `GET /api/tracks/{audioHash}`

Fetches registered metadata for a track.

- **Auth**: none
- **Throttle**: global default

**Response `200`:** `TrackMetadata` (same shape as above).
**Errors:** `400` (malformed hash), `404` (unknown `audioHash`), `429`.

---

## Scores

### `POST /api/scores`

Submits the result of a finished run. Runs the full anti-cheat pipeline before anything is stored
(see [docs/ARCHITECTURE.md — Determinism & anti-cheat](./ARCHITECTURE.md#determinism--anti-cheat)):
schema validation → seed derivation check (`seed === seedFromHash(audioHash)`) → level
regeneration and `score <= maxScore` → checkpoint replay validation (tick alignment to
`CHECKPOINT_INTERVAL_TICKS`, monotonic score, kinematic speed bounds, duration consistency).

- **Auth**: Bearer JWT required
- **Throttle**: 10 requests / 60 s

**Request** (`scoreSubmissionSchema`):

```json
{
  "audioHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "seed": 389582439,
  "score": 1240,
  "distanceM": 1444,
  "finished": true,
  "durationMs": 180500,
  "collectiblesTaken": 18,
  "checkpoints": [
    { "tick": 120, "x": 16.2, "y": 0.4, "score": 20 },
    { "tick": 240, "x": 32.1, "y": 1.1, "score": 45 },
    { "tick": 10800, "x": 1444, "y": 0.2, "score": 1240 }
  ]
}
```

Constraints: `seed` integer; `score` / `collectiblesTaken` non-negative integers; `distanceM`
non-negative finite; `durationMs` positive integer; 1–600 checkpoints, each
`{ tick: int ≥ 0, x: finite, y: finite, score: int ≥ 0 }`.

**Response `201`:** the accepted leaderboard entry:

```json
{
  "rank": 3,
  "playerId": "tg:12345",
  "displayName": "Danila",
  "score": 1240,
  "audioHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "achievedAt": "2026-07-02T14:31:07.000Z"
}
```

**Errors:**

- `400` — schema violation.
- `401` — missing/invalid token.
- `404` — `audioHash` was never registered via `POST /api/tracks`.
- `422` — anti-cheat rejection. The envelope's `message` names the failed check, e.g.:

  ```json
  {
    "statusCode": 422,
    "message": "score 99999 exceeds the level maxScore 1450 for this track",
    "error": "Unprocessable Entity"
  }
  ```

- `429` — rate limit.

---

## Leaderboard

### `GET /api/leaderboard?audioHash={hash}&limit={n}`

Top scores for one track. Feature-gated by `leaderboardEnabled` (`FEATURE_LEADERBOARD`).

- **Auth**: none
- **Throttle**: global default
- **Query** (`leaderboardQuerySchema`): `audioHash` — required, sha-256 hex; `limit` — optional
  integer 1–100, default 20 (string values are coerced).

**Response `200`** (`LeaderboardPage`):

```json
{
  "audioHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "entries": [
    {
      "rank": 1,
      "playerId": "tg:98765",
      "displayName": "BeatMaster",
      "score": 1450,
      "audioHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "achievedAt": "2026-07-01T18:03:44.000Z"
    },
    {
      "rank": 2,
      "playerId": "guest:3f6f2f04-8c2d-4d5e-9b1a-7c0a4a1b2c3d",
      "displayName": "RoadRunner",
      "score": 1310,
      "audioHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "achievedAt": "2026-07-02T09:12:30.000Z"
    }
  ],
  "total": 57
}
```

A track with no submissions yields `entries: []`, `total: 0` (not a 404 — the empty page is a
valid state for a registered track).

**Errors:** `400` (missing/malformed `audioHash`, `limit` out of 1–100), `429`.

---

## Versioning

The API is unversioned pre-1.0. Payload compatibility is anchored to the versioned data contracts
(`BeatMap.version`, `LevelDefinition.version`); breaking changes to endpoints will introduce a
path version (`/api/v2/...`) and be recorded in [CHANGELOG.md](../CHANGELOG.md).
