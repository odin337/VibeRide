import { pino } from 'pino';
import type { Logger as PinoLogger, LoggerOptions } from 'pino';
import type { LoggerService } from '@nestjs/common';

import type { Env } from '../config/env';

/**
 * Pure options builder (testable without spawning pino-pretty's worker
 * thread): JSON lines everywhere, pretty transport only in development.
 */
export function buildPinoOptions(env: Env): LoggerOptions {
  return {
    level: env.logLevel,
    // pid/hostname add no value for a single-container service.
    base: undefined,
    ...(env.nodeEnv === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : {}),
  };
}

export function createPinoLogger(env: Env): PinoLogger {
  return pino(buildPinoOptions(env));
}

function asText(message: unknown): string {
  return typeof message === 'string' ? message : JSON.stringify(message);
}

/**
 * Adapts pino to Nest's LoggerService so framework-internal messages
 * (route mapping, module init, shutdown) flow through the same sink as
 * application logs. Application code logs via pino directly.
 */
export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: PinoLogger) {}

  log(message: unknown, context?: string): void {
    this.logger.info({ context }, asText(message));
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.logger.error({ context, trace }, asText(message));
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn({ context }, asText(message));
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug({ context }, asText(message));
  }

  verbose(message: unknown, context?: string): void {
    this.logger.trace({ context }, asText(message));
  }
}
