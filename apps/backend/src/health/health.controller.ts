import { Controller, Get, Inject, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';

import { HEALTH_SERVICE } from '../common/tokens';
import type { HealthService } from './health.service';

/** Response shape from docs/openapi.yaml `HealthStatus`. */
interface HealthStatusBody {
  readonly status: 'ok' | 'error';
}

/**
 * Liveness/readiness probes (docs/API.md "Operational endpoints"):
 * unprefixed, no auth, exempt from throttling so orchestrator probes can
 * never be rate-limited into a false-negative.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@Inject(HEALTH_SERVICE) private readonly health: HealthService) {}

  @Get()
  liveness(): HealthStatusBody {
    return { status: 'ok' };
  }

  @Get('ready')
  readiness(@Res({ passthrough: true }) reply: FastifyReply): HealthStatusBody {
    if (this.health.isReady()) {
      return { status: 'ok' };
    }
    // Plain { status } body per docs/openapi.yaml — not the error envelope,
    // hence a manual status code instead of a thrown exception.
    reply.status(503);
    return { status: 'error' };
  }
}
