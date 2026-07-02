/**
 * Dependency-injection tokens.
 *
 * Every constructor dependency in this app is injected with an explicit
 * `@Inject(TOKEN)` decorator (string tokens below, or library class refs
 * like JwtService/Reflector). Metadata-based injection is deliberately
 * avoided — see the constraint note in app.module.ts.
 */
export const APP_ENV = 'viberide.backend.env';
export const APP_LOGGER = 'viberide.backend.logger';
export const REQUEST_CONTEXT = 'viberide.backend.request-context';

export const AUTH_SERVICE = 'viberide.backend.auth-service';
export const TRACKS_REPOSITORY = 'viberide.backend.tracks-repository';
export const TRACKS_SERVICE = 'viberide.backend.tracks-service';
export const ANTICHEAT_SERVICE = 'viberide.backend.anticheat-service';
export const LEADERBOARD_REPOSITORY = 'viberide.backend.leaderboard-repository';
export const LEADERBOARD_SERVICE = 'viberide.backend.leaderboard-service';
export const METRICS_SERVICE = 'viberide.backend.metrics-service';
export const HEALTH_SERVICE = 'viberide.backend.health-service';
