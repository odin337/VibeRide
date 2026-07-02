import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import type { Logger as PinoLogger } from 'pino';

import { APP_ENV, APP_LOGGER, REQUEST_CONTEXT } from './common/tokens';
import type { Env } from './config/env';
import { registerRequestLogging } from './logging/request-context';
import type { RequestContextService } from './logging/request-context';

/**
 * Transport-level wiring shared by main.ts and the integration spec:
 * helmet, CORS and the request-id/logging hooks. Everything it reads
 * (env, logger, request-context store) comes from the DI container so the
 * test harness configures nothing twice.
 */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  const env = app.get<Env>(APP_ENV);
  const logger = app.get<PinoLogger>(APP_LOGGER);
  const contexts = app.get<RequestContextService>(REQUEST_CONTEXT);

  // API-tuned CSP: this service only ever emits JSON, so every fetch/embed
  // directive is locked to 'none' — a CSP exists purely as defense in depth
  // for any response a browser might render directly (e.g. error bodies).
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
        'frame-ancestors': ["'none'"],
      },
    },
  });

  // Browser callers are exactly the two frontends (docs/SETUP.md
  // CORS_ORIGINS). The API is cookie-free, so credentials stay disabled.
  await app.register(cors, {
    origin: [...env.corsOrigins],
    methods: ['GET', 'POST'],
  });

  const instance: FastifyInstance = app.getHttpAdapter().getInstance();
  registerRequestLogging(instance, logger, contexts);
}
