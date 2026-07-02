import { NotFoundException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { MetricsInterceptor } from './metrics.interceptor';
import type { MetricsService } from './metrics.service';

interface Observation {
  readonly method: string;
  readonly route: string;
  readonly status: number;
  readonly durationSec: number;
}

function recordingMetrics(): { metrics: MetricsService; observations: Observation[] } {
  const observations: Observation[] = [];
  const metrics = {
    observeHttpRequest(method: string, route: string, status: number, durationSec: number): void {
      observations.push({ method, route, status, durationSec });
    },
  } as unknown as MetricsService;
  return { metrics, observations };
}

function contextFor(options: {
  method: string;
  url: string;
  routeUrl: string | undefined;
  statusCode: number;
}): ExecutionContext {
  const request = {
    method: options.method,
    url: options.url,
    routeOptions: { url: options.routeUrl },
  };
  const reply = { statusCode: options.statusCode };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply }),
  } as unknown as ExecutionContext;
}

const passthrough: CallHandler = { handle: () => of('payload') };

describe('MetricsInterceptor — success path', () => {
  it('records the matched route pattern, status and a non-negative duration', async () => {
    const { metrics, observations } = recordingMetrics();
    const interceptor = new MetricsInterceptor(metrics);
    const context = contextFor({
      method: 'GET',
      url: '/api/tracks/abc123',
      routeUrl: '/api/tracks/:audioHash',
      statusCode: 200,
    });
    await expect(firstValueFrom(interceptor.intercept(context, passthrough))).resolves.toBe(
      'payload',
    );
    expect(observations).toHaveLength(1);
    const observed = observations[0]!;
    expect(observed.method).toBe('GET');
    expect(observed.route).toBe('/api/tracks/:audioHash');
    expect(observed.status).toBe(200);
    expect(observed.durationSec).toBeGreaterThanOrEqual(0);
  });

  it('maps an untouched 200 on POST to the 201 Nest will actually send', async () => {
    const { metrics, observations } = recordingMetrics();
    const interceptor = new MetricsInterceptor(metrics);
    const context = contextFor({
      method: 'POST',
      url: '/api/scores',
      routeUrl: '/api/scores',
      statusCode: 200,
    });
    await firstValueFrom(interceptor.intercept(context, passthrough));
    expect(observations[0]!.status).toBe(201);
  });

  it('keeps explicitly set non-200 statuses as-is', async () => {
    const { metrics, observations } = recordingMetrics();
    const interceptor = new MetricsInterceptor(metrics);
    const readiness = contextFor({
      method: 'GET',
      url: '/health/ready',
      routeUrl: '/health/ready',
      statusCode: 503,
    });
    await firstValueFrom(interceptor.intercept(readiness, passthrough));
    const explicitPost = contextFor({
      method: 'POST',
      url: '/api/scores',
      routeUrl: '/api/scores',
      statusCode: 503,
    });
    await firstValueFrom(interceptor.intercept(explicitPost, passthrough));
    expect(observations.map((observation) => observation.status)).toEqual([503, 503]);
  });

  it('falls back to the concrete URL when no route pattern matched', async () => {
    const { metrics, observations } = recordingMetrics();
    const interceptor = new MetricsInterceptor(metrics);
    const context = contextFor({
      method: 'GET',
      url: '/no-such-route',
      routeUrl: undefined,
      statusCode: 200,
    });
    await firstValueFrom(interceptor.intercept(context, passthrough));
    expect(observations[0]!.route).toBe('/no-such-route');
  });
});

describe('MetricsInterceptor — error path', () => {
  it('records the HttpException status and re-throws', async () => {
    const { metrics, observations } = recordingMetrics();
    const interceptor = new MetricsInterceptor(metrics);
    const failing: CallHandler = {
      handle: () => throwError(() => new NotFoundException('missing')),
    };
    const context = contextFor({
      method: 'GET',
      url: '/api/tracks/x',
      routeUrl: '/api/tracks/:audioHash',
      statusCode: 200,
    });
    await expect(firstValueFrom(interceptor.intercept(context, failing))).rejects.toThrow(
      NotFoundException,
    );
    expect(observations[0]!.status).toBe(404);
  });

  it('records unexpected errors as 500', async () => {
    const { metrics, observations } = recordingMetrics();
    const interceptor = new MetricsInterceptor(metrics);
    const failing: CallHandler = { handle: () => throwError(() => new Error('boom')) };
    const context = contextFor({
      method: 'POST',
      url: '/api/scores',
      routeUrl: '/api/scores',
      statusCode: 200,
    });
    await expect(firstValueFrom(interceptor.intercept(context, failing))).rejects.toThrow('boom');
    expect(observations[0]!.status).toBe(500);
  });
});
