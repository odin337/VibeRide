import { Controller, Get, Header, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { METRICS_SERVICE } from '../common/tokens';
import type { MetricsService } from './metrics.service';

/**
 * Prometheus scrape endpoint (docs/API.md "Operational endpoints"):
 * unprefixed, unauthenticated at the app level (restrict at the
 * ingress/network layer in production — docs/SECURITY.md), exempt from
 * throttling so scrapes never compete with client quota.
 */
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(@Inject(METRICS_SERVICE) private readonly metrics: MetricsService) {}

  @Get()
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  render(): Promise<string> {
    return this.metrics.render();
  }
}
