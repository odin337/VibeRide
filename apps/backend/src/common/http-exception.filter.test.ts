import { HttpException, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Logger as PinoLogger } from 'pino';
import { describe, expect, it } from 'vitest';

import { RequestContextService } from '../logging/request-context';
import { HttpExceptionFilter } from './http-exception.filter';

interface LoggedLine {
  readonly level: 'debug' | 'error';
  readonly payload: Record<string, unknown>;
  readonly message: string;
}

function recordingLogger(): { logger: PinoLogger; lines: LoggedLine[] } {
  const lines: LoggedLine[] = [];
  const record =
    (level: LoggedLine['level']) =>
    (payload: Record<string, unknown>, message: string): void => {
      lines.push({ level, payload, message });
    };
  const logger = {
    debug: record('debug'),
    error: record('error'),
  } as unknown as PinoLogger;
  return { logger, lines };
}

interface Sent {
  statusCode?: number;
  body?: unknown;
}

function fakeReply(sent: Sent): FastifyReply {
  const reply = {
    status(code: number): unknown {
      sent.statusCode = code;
      return reply;
    },
    send(body: unknown): unknown {
      sent.body = body;
      return reply;
    },
  };
  return reply as unknown as FastifyReply;
}

const request = { method: 'GET', url: '/boom' } as unknown as FastifyRequest;

function hostFor(reply: FastifyReply): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => reply, getRequest: () => request }),
  } as unknown as ArgumentsHost;
}

function makeFilter(): {
  filter: HttpExceptionFilter;
  lines: LoggedLine[];
  contexts: RequestContextService;
} {
  const { logger, lines } = recordingLogger();
  const contexts = new RequestContextService();
  return { filter: new HttpExceptionFilter(logger, contexts), lines, contexts };
}

describe('HttpExceptionFilter', () => {
  it('renders object-response HttpExceptions as the documented envelope', () => {
    const { filter, lines } = makeFilter();
    const sent: Sent = {};
    filter.catch(new NotFoundException('track missing'), hostFor(fakeReply(sent)));
    expect(sent.statusCode).toBe(404);
    expect(sent.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'track missing',
    });
    expect(lines).toEqual([
      {
        level: 'debug',
        payload: { statusCode: 404, method: 'GET', url: '/boom' },
        message: 'request rejected',
      },
    ]);
  });

  it('wraps string-response HttpExceptions with the matching reason phrase', () => {
    const { filter } = makeFilter();
    const sent: Sent = {};
    filter.catch(new HttpException('slow down', 429), hostFor(fakeReply(sent)));
    expect(sent.body).toEqual({
      statusCode: 429,
      message: 'slow down',
      error: 'Too Many Requests',
    });
  });

  it('falls back to a generic reason phrase for undocumented statuses', () => {
    const { filter } = makeFilter();
    const sent: Sent = {};
    filter.catch(new HttpException('teapot', 418), hostFor(fakeReply(sent)));
    expect(sent.body).toEqual({ statusCode: 418, message: 'teapot', error: 'Error' });
  });

  it('hides unexpected errors behind a generic 500 and logs the cause', () => {
    const { filter, lines } = makeFilter();
    const sent: Sent = {};
    const cause = new Error('database exploded');
    filter.catch(cause, hostFor(fakeReply(sent)));
    expect(sent.statusCode).toBe(500);
    expect(sent.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.level).toBe('error');
    expect(line.message).toBe('unhandled error');
    expect(line.payload.err).toBe(cause);
  });

  it('wraps non-Error thrown values so the log always carries an Error', () => {
    const { filter, lines } = makeFilter();
    const sent: Sent = {};
    filter.catch({ code: 'weird' }, hostFor(fakeReply(sent)));
    expect(sent.statusCode).toBe(500);
    const logged = lines[0]!.payload.err;
    expect(logged).toBeInstanceOf(Error);
    expect((logged as Error).message).toBe('{"code":"weird"}');
  });

  it('prefers the request-scoped child logger when a context exists', () => {
    const { filter, lines, contexts } = makeFilter();
    const child = recordingLogger();
    contexts.set(request, { requestId: 'req-1', logger: child.logger, startedAtNs: 0n });
    const sent: Sent = {};
    filter.catch(new NotFoundException('gone'), hostFor(fakeReply(sent)));
    expect(child.lines).toHaveLength(1);
    expect(lines).toHaveLength(0);
  });
});
