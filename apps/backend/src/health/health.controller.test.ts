import type { FastifyReply } from 'fastify';
import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

function fakeReply(): { reply: FastifyReply; statuses: number[] } {
  const statuses: number[] = [];
  const reply = {
    status(code: number): unknown {
      statuses.push(code);
      return reply;
    },
  };
  return { reply: reply as unknown as FastifyReply, statuses };
}

describe('HealthController', () => {
  it('always answers the liveness probe with ok', () => {
    const controller = new HealthController(new HealthService());
    expect(controller.liveness()).toEqual({ status: 'ok' });
  });

  it('answers the readiness probe with ok while the service is ready', () => {
    const controller = new HealthController(new HealthService());
    const { reply, statuses } = fakeReply();
    expect(controller.readiness(reply)).toEqual({ status: 'ok' });
    expect(statuses).toEqual([]);
  });

  it('flips the readiness probe to a 503 plain body once draining starts', () => {
    const service = new HealthService();
    service.onApplicationShutdown();
    const controller = new HealthController(service);
    const { reply, statuses } = fakeReply();
    expect(controller.readiness(reply)).toEqual({ status: 'error' });
    expect(statuses).toEqual([503]);
  });
});
