import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadEnv } from './config/env';
import { createPinoLogger, PinoNestLogger } from './logging/pino-logger';

async function bootstrap(): Promise<void> {
  const env = loadEnv(process.env);
  const logger = createPinoLogger(env);
  if (env.jwtSecretIsFallback) {
    logger.warn(
      'JWT_SECRET is not set — using the built-in development-only secret. ' +
        'Set JWT_SECRET (openssl rand -hex 32) before deploying; production refuses to boot without it.',
    );
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env, logger),
    // Fastify's own logger stays off: request logging is a pino child per
    // request (src/logging/request-context.ts) with a crypto.randomUUID id.
    new FastifyAdapter({ logger: false }),
    { logger: new PinoNestLogger(logger) },
  );
  await configureApp(app);
  app.enableShutdownHooks();

  await app.listen(env.port, env.host);
  logger.info({ port: env.port, host: env.host, nodeEnv: env.nodeEnv }, 'backend listening');
}

bootstrap().catch((error: unknown) => {
  // The logger may not exist yet (env validation happens first), so this
  // last-resort path writes straight to stderr — not console (ESLint).
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`fatal: backend failed to start: ${detail}\n`);
  process.exitCode = 1;
});
