import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Logger as PinoLogger } from 'pino';

import { AuthModule } from './auth/auth.module';
import { CoreModule } from './common/core.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import type { Env } from './config/env';
import { HealthModule } from './health/health.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { MetricsModule } from './metrics/metrics.module';
import { TracksModule } from './tracks/tracks.module';

/**
 * DI CONSTRAINT (do not "clean up"): vitest compiles TypeScript with
 * esbuild, which supports experimentalDecorators but NOT
 * emitDecoratorMetadata — `design:paramtypes` is never emitted, so
 * metadata-based constructor injection silently resolves to undefined in
 * tests. Therefore EVERY constructor dependency in this app uses an
 * explicit `@Inject(TOKEN)` decorator (string tokens from common/tokens.ts
 * or library class refs like JwtService), unit tests construct services
 * manually (`new Service(deps)`), and the integration spec relies on the
 * same explicit tokens through Test.createTestingModule. Library-internal
 * classes (ThrottlerGuard, JwtService) ship precompiled JS with their
 * metadata baked in, so they are unaffected.
 */
@Module({})
export class AppModule {
  static forRoot(env: Env, logger: PinoLogger): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreModule.forRoot(env, logger),
        // Global default from env (docs/API.md: 60 req / 60 s); auth and
        // scores controllers carry stricter @Throttle overrides, health and
        // metrics opt out via @SkipThrottle.
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: env.throttleTtlSec * 1000, limit: env.throttleLimit }],
        }),
        JwtModule.register({
          global: true,
          secret: env.jwtSecret,
          signOptions: { expiresIn: env.jwtExpiresIn },
        }),
        HealthModule,
        MetricsModule,
        AuthModule,
        TracksModule,
        LeaderboardModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
      ],
    };
  }
}
