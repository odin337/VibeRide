import type { Logger as PinoLogger } from 'pino';
import { describe, expect, it } from 'vitest';

import { loadEnv } from '../config/env';
import { buildPinoOptions, createPinoLogger, PinoNestLogger } from './pino-logger';

interface LoggedLine {
  readonly level: string;
  readonly bindings: Record<string, unknown>;
  readonly message: string;
}

function recordingLogger(): { logger: PinoLogger; lines: LoggedLine[] } {
  const lines: LoggedLine[] = [];
  const record =
    (level: string) =>
    (bindings: Record<string, unknown>, message: string): void => {
      lines.push({ level, bindings, message });
    };
  const logger = {
    info: record('info'),
    error: record('error'),
    warn: record('warn'),
    debug: record('debug'),
    trace: record('trace'),
  } as unknown as PinoLogger;
  return { logger, lines };
}

describe('buildPinoOptions', () => {
  it('mirrors the configured level and drops pid/hostname', () => {
    const options = buildPinoOptions(loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'warn' }));
    expect(options.level).toBe('warn');
    expect(options.base).toBeUndefined();
    expect(options.transport).toBeUndefined();
  });

  it('enables the pretty transport only in development', () => {
    const dev = buildPinoOptions(loadEnv({ NODE_ENV: 'development' }));
    expect(dev.transport).toEqual({ target: 'pino-pretty', options: { colorize: true } });
    const prod = buildPinoOptions(loadEnv({ NODE_ENV: 'production', JWT_SECRET: 's'.repeat(32) }));
    expect(prod.transport).toBeUndefined();
  });
});

describe('createPinoLogger', () => {
  it('creates a pino logger at the configured level', () => {
    const logger = createPinoLogger(loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'error' }));
    expect(logger.level).toBe('error');
    expect(typeof logger.info).toBe('function');
  });
});

describe('PinoNestLogger', () => {
  it('maps every Nest log level onto the pino sink', () => {
    const { logger, lines } = recordingLogger();
    const nest = new PinoNestLogger(logger);
    nest.log('starting', 'Bootstrap');
    nest.error('failed', 'stack-trace', 'Bootstrap');
    nest.warn('careful', 'Bootstrap');
    nest.debug('details', 'Bootstrap');
    nest.verbose('noise', 'Bootstrap');
    expect(lines).toEqual([
      { level: 'info', bindings: { context: 'Bootstrap' }, message: 'starting' },
      {
        level: 'error',
        bindings: { context: 'Bootstrap', trace: 'stack-trace' },
        message: 'failed',
      },
      { level: 'warn', bindings: { context: 'Bootstrap' }, message: 'careful' },
      { level: 'debug', bindings: { context: 'Bootstrap' }, message: 'details' },
      { level: 'trace', bindings: { context: 'Bootstrap' }, message: 'noise' },
    ]);
  });

  it('serializes non-string messages to JSON', () => {
    const { logger, lines } = recordingLogger();
    new PinoNestLogger(logger).log({ route: '/health', mapped: true });
    expect(lines[0]!.message).toBe('{"route":"/health","mapped":true}');
    expect(lines[0]!.bindings).toEqual({ context: undefined });
  });
});
