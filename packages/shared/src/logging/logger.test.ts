import { describe, expect, it, vi } from 'vitest';

import type { LogLevel } from './logger';
import { createConsoleLogger, noopLogger } from './logger';

function createCapture(): {
  sink: (level: LogLevel, line: string) => void;
  records: { level: LogLevel; parsed: Record<string, unknown> }[];
} {
  const records: { level: LogLevel; parsed: Record<string, unknown> }[] = [];
  return {
    records,
    sink: (level, line) => {
      records.push({ level, parsed: JSON.parse(line) as Record<string, unknown> });
    },
  };
}

const fixedNow = (): string => '2026-01-01T00:00:00.000Z';

describe('createConsoleLogger', () => {
  it('emits structured JSON with level, time and message', () => {
    const capture = createCapture();
    const logger = createConsoleLogger({ minLevel: 'debug', sink: capture.sink, now: fixedNow });
    logger.info('hello', { runId: 7 });
    expect(capture.records).toHaveLength(1);
    expect(capture.records[0]?.parsed).toEqual({
      level: 'info',
      time: '2026-01-01T00:00:00.000Z',
      msg: 'hello',
      runId: 7,
    });
  });

  it('filters records below the minimum level', () => {
    const capture = createCapture();
    const logger = createConsoleLogger({ minLevel: 'warn', sink: capture.sink, now: fixedNow });
    logger.debug('drop');
    logger.info('drop');
    logger.warn('keep');
    logger.error('keep');
    expect(capture.records.map((r) => r.level)).toEqual(['warn', 'error']);
  });

  it('child() merges bindings into every record', () => {
    const capture = createCapture();
    const logger = createConsoleLogger({ minLevel: 'info', sink: capture.sink, now: fixedNow });
    const child = logger.child({ module: 'audio' });
    child.info('analyzing', { file: 'a.mp3' });
    expect(capture.records[0]?.parsed).toMatchObject({ module: 'audio', file: 'a.mp3' });
  });

  it('writes to the console by default, mapping levels to streams', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const logger = createConsoleLogger({ minLevel: 'debug', now: fixedNow });
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      expect(info).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      info.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });
});

describe('noopLogger', () => {
  it('swallows everything and returns itself as child', () => {
    expect(() => {
      noopLogger.debug('x');
      noopLogger.info('x');
      noopLogger.warn('x');
      noopLogger.error('x');
    }).not.toThrow();
    expect(noopLogger.child({ a: 1 })).toBe(noopLogger);
  });
});
