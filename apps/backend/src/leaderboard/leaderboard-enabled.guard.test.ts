import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { loadEnv } from '../config/env';
import { LeaderboardEnabledGuard } from './leaderboard-enabled.guard';

describe('LeaderboardEnabledGuard', () => {
  it('lets requests through while the leaderboard flag is on (the default)', () => {
    expect(new LeaderboardEnabledGuard(loadEnv({})).canActivate()).toBe(true);
  });

  it('hides the routes behind 404 when FEATURE_LEADERBOARD is off', () => {
    const guard = new LeaderboardEnabledGuard(loadEnv({ FEATURE_LEADERBOARD: 'off' }));
    expect(() => guard.canActivate()).toThrow(NotFoundException);
    expect(() => guard.canActivate()).toThrow(/FEATURE_LEADERBOARD/);
  });
});
