import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

/**
 * Owns the prom-client Registry: Node default metrics plus the HTTP
 * metrics populated by MetricsInterceptor — http_requests_total (the
 * counter shown in docs/API.md) and http_request_duration_seconds. An own
 * Registry (not the global one) keeps tests isolated — each service
 * instance starts from a clean slate.
 */
@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  private readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'path', 'status'] as const,
    registers: [this.registry],
  });

  private readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  observeHttpRequest(method: string, route: string, status: number, durationSec: number): void {
    const statusLabel = String(status);
    this.httpRequestsTotal.inc({ method, path: route, status: statusLabel });
    this.httpRequestDuration.observe({ method, route, status: statusLabel }, durationSec);
  }

  /** Prometheus text exposition format. */
  render(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
