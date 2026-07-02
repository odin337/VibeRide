import { Catch, HttpException, Inject, Injectable } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Logger as PinoLogger } from 'pino';

import type { RequestContextService } from '../logging/request-context';
import { APP_LOGGER, REQUEST_CONTEXT } from './tokens';

/**
 * Reason phrases for every status the API documents (docs/API.md) — the
 * `error` field of the envelope.
 */
const REASON_PHRASES: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

function reasonPhrase(statusCode: number): string {
  return REASON_PHRASES[statusCode] ?? 'Error';
}

/**
 * Renders every thrown error as the uniform docs/API.md envelope
 * `{ statusCode, message, error }`. Unexpected (non-HttpException) errors
 * become a generic 500 — internals and stack traces are never leaked to the
 * client in any environment; they go to the request-scoped structured log
 * (with the request id) instead.
 */
@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(APP_LOGGER) private readonly logger: PinoLogger,
    @Inject(REQUEST_CONTEXT) private readonly contexts: RequestContextService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const request = http.getRequest<FastifyRequest>();
    const context = this.contexts.get(request);
    const requestLogger = context?.logger ?? this.logger;

    let statusCode: number;
    let body: Record<string, unknown>;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();
      body =
        typeof response === 'string'
          ? { statusCode, message: response, error: reasonPhrase(statusCode) }
          : {
              statusCode,
              error: reasonPhrase(statusCode),
              ...(response as Record<string, unknown>),
            };
      requestLogger.debug(
        { statusCode, method: request.method, url: request.url },
        'request rejected',
      );
    } else {
      statusCode = 500;
      body = { statusCode, message: 'Internal server error', error: 'Internal Server Error' };
      requestLogger.error(
        {
          statusCode,
          method: request.method,
          url: request.url,
          err: exception instanceof Error ? exception : new Error(JSON.stringify(exception)),
        },
        'unhandled error',
      );
    }

    reply.status(statusCode).send(body);
  }
}
