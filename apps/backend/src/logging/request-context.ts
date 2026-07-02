import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { Logger as PinoLogger } from 'pino';

/** Per-request state attached at the Fastify onRequest hook. */
export interface RequestContext {
  readonly requestId: string;
  /** Child logger with the requestId bound to every line. */
  readonly logger: PinoLogger;
  readonly startedAtNs: bigint;
}

/**
 * Maps live request objects to their context. A WeakMap keyed by the request
 * itself needs no cleanup hook and cannot leak across requests.
 */
export class RequestContextService {
  private readonly contexts = new WeakMap<object, RequestContext>();

  set(request: object, context: RequestContext): void {
    this.contexts.set(request, context);
  }

  get(request: object): RequestContext | undefined {
    return this.contexts.get(request);
  }
}

/**
 * Fastify hooks: assign a request id (crypto.randomUUID), bind a child
 * logger, echo the id back as `x-request-id`, and log one structured line
 * per completed request.
 */
export function registerRequestLogging(
  instance: FastifyInstance,
  logger: PinoLogger,
  contexts: RequestContextService,
): void {
  instance.addHook('onRequest', (request, reply, done) => {
    const requestId = randomUUID();
    contexts.set(request, {
      requestId,
      logger: logger.child({ requestId }),
      startedAtNs: process.hrtime.bigint(),
    });
    reply.header('x-request-id', requestId);
    done();
  });

  instance.addHook('onResponse', (request, reply, done) => {
    const context = contexts.get(request);
    if (context) {
      const durationMs = Number(process.hrtime.bigint() - context.startedAtNs) / 1e6;
      context.logger.info(
        {
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
          durationMs: Math.round(durationMs * 1000) / 1000,
        },
        'request completed',
      );
    }
    done();
  });
}
