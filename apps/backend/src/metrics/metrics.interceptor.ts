import { HttpException, Inject, Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { tap } from 'rxjs';
import type { Observable } from 'rxjs';

import { METRICS_SERVICE } from '../common/tokens';
import type { MetricsService } from './metrics.service';

/**
 * Times every handled request into the HTTP metrics. The route label uses
 * the matched route pattern (`/api/tracks/:audioHash`), never the concrete
 * URL — concrete URLs would explode label cardinality.
 *
 * Known limitation: interceptors run after guards, so requests rejected by
 * a guard (401s, throttled 429s) are not counted.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(@Inject(METRICS_SERVICE) private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const startedAtNs = process.hrtime.bigint();

    const record = (status: number): void => {
      const durationSec = Number(process.hrtime.bigint() - startedAtNs) / 1e9;
      const route = request.routeOptions.url ?? request.url;
      this.metrics.observeHttpRequest(request.method, route, status, durationSec);
    };

    return next.handle().pipe(
      tap({
        next: () => {
          record(this.successStatus(request.method, reply.statusCode));
        },
        error: (error: unknown) => {
          record(error instanceof HttpException ? error.getStatus() : 500);
        },
      }),
    );
  }

  /**
   * Nest applies the default success status (POST → 201) to the reply only
   * after the interceptor chain completes, so an untouched 200 on a POST is
   * mapped here the same way Nest's router will map it. Handlers that set
   * an explicit non-200 status (e.g. the 503 readiness path) already show
   * it on the reply at this point.
   */
  private successStatus(method: string, replyStatus: number): number {
    return replyStatus === 200 && method === 'POST' ? 201 : replyStatus;
  }
}
