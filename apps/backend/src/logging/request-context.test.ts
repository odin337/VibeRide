import { fastify } from 'fastify';
import type { Logger as PinoLogger } from 'pino';
import { describe, expect, it } from 'vitest';

import { registerRequestLogging, RequestContextService } from './request-context';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface CompletionLine {
  readonly payload: Record<string, unknown>;
  readonly message: string;
}

function recordingLogger(): {
  logger: PinoLogger;
  infoLines: CompletionLine[];
  childBindings: Record<string, unknown>[];
} {
  const infoLines: CompletionLine[] = [];
  const childBindings: Record<string, unknown>[] = [];
  const child = {
    info: (payload: Record<string, unknown>, message: string): void => {
      infoLines.push({ payload, message });
    },
  };
  const logger = {
    child: (bindings: Record<string, unknown>): unknown => {
      childBindings.push(bindings);
      return child;
    },
  } as unknown as PinoLogger;
  return { logger, infoLines, childBindings };
}

describe('RequestContextService', () => {
  it('stores context per request object and misses unknown requests', () => {
    const service = new RequestContextService();
    const request = {};
    const context = {
      requestId: 'req-1',
      logger: recordingLogger().logger,
      startedAtNs: 0n,
    };
    service.set(request, context);
    expect(service.get(request)).toBe(context);
    expect(service.get({})).toBeUndefined();
  });
});

describe('registerRequestLogging', () => {
  it('assigns a request id, echoes it back and logs one completion line', async () => {
    const { logger, infoLines, childBindings } = recordingLogger();
    const contexts = new RequestContextService();
    const instance = fastify({ logger: false });
    instance.get('/ping', () => ({ pong: true }));
    registerRequestLogging(instance, logger, contexts);

    try {
      const response = await instance.inject({ method: 'GET', url: '/ping' });
      expect(response.statusCode).toBe(200);
      const requestId = String(response.headers['x-request-id']);
      expect(requestId).toMatch(UUID_PATTERN);
      expect(childBindings).toEqual([{ requestId }]);
      expect(infoLines).toHaveLength(1);
      const line = infoLines[0]!;
      expect(line.message).toBe('request completed');
      expect(line.payload.method).toBe('GET');
      expect(line.payload.url).toBe('/ping');
      expect(line.payload.statusCode).toBe(200);
      expect(typeof line.payload.durationMs).toBe('number');
      expect(line.payload.durationMs).toBeGreaterThanOrEqual(0);
    } finally {
      await instance.close();
    }
  });

  it('gives every request its own id and child logger', async () => {
    const { logger, infoLines, childBindings } = recordingLogger();
    const contexts = new RequestContextService();
    const instance = fastify({ logger: false });
    instance.get('/ping', () => ({ pong: true }));
    registerRequestLogging(instance, logger, contexts);

    try {
      const first = await instance.inject({ method: 'GET', url: '/ping' });
      const second = await instance.inject({ method: 'GET', url: '/ping' });
      expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
      expect(childBindings).toHaveLength(2);
      expect(infoLines).toHaveLength(2);
    } finally {
      await instance.close();
    }
  });
});
