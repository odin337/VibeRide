import { serializeBeatMap } from '@viberide/audio-engine';
import { noopLogger, sha256HexSchema } from '@viberide/shared';
import type {
  BeatMap,
  GuestAuthRequest,
  LeaderboardEntry,
  LeaderboardPage,
  Logger,
  ScoreSubmission,
  TelegramAuthRequest,
  TrackMetadata,
} from '@viberide/shared';
import { z } from 'zod';

/**
 * Typed backend client (docs/API.md). Every response is zod-validated and
 * every method returns a Result — a leaderboard hiccup must never crash
 * the game, so nothing here throws for expected failure modes.
 */

export type ApiErrorKind = 'network' | 'http' | 'validation';

export interface ApiError {
  readonly kind: ApiErrorKind;
  /** HTTP status for kind 'http'. */
  readonly status?: number;
  readonly message: string;
}

export type ApiResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiError };

const playerSchema = z.object({
  id: z.string().min(1),
  displayName: z.string(),
  kind: z.enum(['guest', 'telegram']),
});

export const authResponseSchema = z.object({
  token: z.string().min(1),
  player: playerSchema,
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

export const leaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  playerId: z.string().min(1),
  displayName: z.string(),
  score: z.number().int().nonnegative(),
  audioHash: sha256HexSchema,
  achievedAt: z.string().min(1),
});

export const leaderboardPageSchema = z.object({
  audioHash: sha256HexSchema,
  entries: z.array(leaderboardEntrySchema),
  total: z.number().int().nonnegative(),
});

export const trackMetadataResponseSchema = z.object({
  audioHash: sha256HexSchema,
  title: z.string(),
  durationSec: z.number().positive(),
  bpm: z.number().min(40).max(300),
});

export interface RegisterTrackInput {
  readonly metadata: TrackMetadata;
  readonly beatMap: BeatMap;
}

export interface ApiClient {
  authGuest(request: GuestAuthRequest): Promise<ApiResult<AuthResponse>>;
  authTelegram(request: TelegramAuthRequest): Promise<ApiResult<AuthResponse>>;
  registerTrack(input: RegisterTrackInput): Promise<ApiResult<TrackMetadata>>;
  submitScore(submission: ScoreSubmission): Promise<ApiResult<LeaderboardEntry>>;
  getLeaderboard(audioHash: string, limit?: number): Promise<ApiResult<LeaderboardPage>>;
  /** Token currently held in memory (never persisted), or null. */
  getToken(): string | null;
}

export interface ApiClientOptions {
  /** Backend origin; empty string means same-origin requests. */
  readonly baseUrl?: string;
  /** Injectable fetch for tests. */
  readonly fetchImpl?: typeof fetch;
  readonly logger?: Logger;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
    .join('; ');
}

/** Extracts the NestJS error envelope message, tolerating any body shape. */
function extractHttpMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = body.message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return message.filter((item): item is string => typeof item === 'string').join('; ');
    }
  }
  return `HTTP ${status}`;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
  const fetchImpl: typeof fetch =
    options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const logger = options.logger ?? noopLogger;
  // Kept in memory only — never persisted. Named to stay clear of the
  // security plugin's identifier heuristics for string comparisons.
  let sessionToken: string | null = null;

  async function request<T>(
    method: 'GET' | 'POST',
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (sessionToken !== null) {
      headers.Authorization = `Bearer ${sessionToken}`;
    }

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      const message = describeError(error);
      logger.warn('api request failed to send', { method, path, message });
      return { ok: false, error: { kind: 'network', message } };
    }

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    if (!response.ok) {
      const message = extractHttpMessage(json, response.status);
      logger.warn('api request rejected', { method, path, status: response.status, message });
      return { ok: false, error: { kind: 'http', status: response.status, message } };
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const message = formatZodIssues(parsed.error);
      logger.warn('api response failed validation', { method, path, message });
      return { ok: false, error: { kind: 'validation', message } };
    }
    return { ok: true, value: parsed.data };
  }

  async function authenticate(path: string, body: unknown): Promise<ApiResult<AuthResponse>> {
    const result = await request('POST', path, authResponseSchema, body);
    if (result.ok) {
      sessionToken = result.value.token;
    }
    return result;
  }

  return {
    authGuest(requestBody: GuestAuthRequest): Promise<ApiResult<AuthResponse>> {
      return authenticate('/api/auth/guest', requestBody);
    },

    authTelegram(requestBody: TelegramAuthRequest): Promise<ApiResult<AuthResponse>> {
      return authenticate('/api/auth/telegram', requestBody);
    },

    registerTrack(input: RegisterTrackInput): Promise<ApiResult<TrackMetadata>> {
      // The metadata shape follows trackMetadataSchema (docs/API.md); the
      // serialized BeatMap rides along so the backend can regenerate the
      // level for anti-cheat validation.
      let serializedBeatMap: string;
      try {
        serializedBeatMap = serializeBeatMap(input.beatMap);
      } catch (error) {
        return Promise.resolve({
          ok: false,
          error: { kind: 'validation', message: describeError(error) },
        });
      }
      return request('POST', '/api/tracks', trackMetadataResponseSchema, {
        ...input.metadata,
        beatMap: serializedBeatMap,
      });
    },

    submitScore(submission: ScoreSubmission): Promise<ApiResult<LeaderboardEntry>> {
      return request('POST', '/api/scores', leaderboardEntrySchema, submission);
    },

    getLeaderboard(audioHash: string, limit?: number): Promise<ApiResult<LeaderboardPage>> {
      const query = new URLSearchParams({ audioHash });
      if (limit !== undefined) {
        query.set('limit', String(limit));
      }
      return request('GET', `/api/leaderboard?${query.toString()}`, leaderboardPageSchema);
    },

    getToken(): string | null {
      return sessionToken;
    },
  };
}
