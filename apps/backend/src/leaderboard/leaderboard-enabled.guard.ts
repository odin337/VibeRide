import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CanActivate } from '@nestjs/common';

import { APP_ENV } from '../common/tokens';
import type { Env } from '../config/env';

/**
 * Feature gate for the scores/leaderboard endpoints (docs/API.md:
 * "Feature-gated by leaderboardEnabled (FEATURE_LEADERBOARD)"). When the
 * flag is off the routes behave as absent — 404, mirroring the docs status
 * table where 404 is the only "not here" signal.
 */
@Injectable()
export class LeaderboardEnabledGuard implements CanActivate {
  constructor(@Inject(APP_ENV) private readonly env: Env) {}

  canActivate(): boolean {
    if (!this.env.flags.leaderboardEnabled) {
      throw new NotFoundException('leaderboard endpoints are disabled (FEATURE_LEADERBOARD)');
    }
    return true;
  }
}
