import { describe, expect, it } from 'vitest';

import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports ready from construction until shutdown begins', () => {
    const service = new HealthService();
    expect(service.isReady()).toBe(true);
    service.onApplicationShutdown();
    expect(service.isReady()).toBe(false);
  });

  it('stays not-ready once draining has started', () => {
    const service = new HealthService();
    service.onApplicationShutdown();
    service.onApplicationShutdown();
    expect(service.isReady()).toBe(false);
  });
});
