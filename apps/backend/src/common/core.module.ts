import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { Logger as PinoLogger } from 'pino';

import type { Env } from '../config/env';
import { RequestContextService } from '../logging/request-context';
import { APP_ENV, APP_LOGGER, REQUEST_CONTEXT } from './tokens';

/**
 * Global providers shared by every feature module: the validated
 * environment, the root pino logger and the per-request context store.
 * Values are passed in from the bootstrap (or the test harness) so the
 * whole dependency graph is a pure function of (env, logger).
 */
@Module({})
export class CoreModule {
  static forRoot(env: Env, logger: PinoLogger): DynamicModule {
    return {
      module: CoreModule,
      global: true,
      providers: [
        { provide: APP_ENV, useValue: env },
        { provide: APP_LOGGER, useValue: logger },
        { provide: REQUEST_CONTEXT, useValue: new RequestContextService() },
      ],
      exports: [APP_ENV, APP_LOGGER, REQUEST_CONTEXT],
    };
  }
}
