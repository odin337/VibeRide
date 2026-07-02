import { describe, expect, it } from 'vitest';

import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('renders observed requests in Prometheus text exposition format', async () => {
    const service = new MetricsService();
    service.observeHttpRequest('GET', '/health', 200, 0.012);
    service.observeHttpRequest('GET', '/health', 200, 0.034);
    service.observeHttpRequest('POST', '/api/scores', 422, 0.2);
    const text = await service.render();
    expect(text).toContain('# HELP http_requests_total Total HTTP requests');
    expect(text).toContain('http_requests_total{method="GET",path="/health",status="200"} 2');
    expect(text).toContain('http_requests_total{method="POST",path="/api/scores",status="422"} 1');
    expect(text).toContain('# HELP http_request_duration_seconds HTTP request duration');
    expect(text).toContain('http_request_duration_seconds_bucket');
  });

  it('collects Node default metrics into its own isolated registry', async () => {
    const text = await new MetricsService().render();
    expect(text).toContain('process_cpu_user_seconds_total');
    // A fresh instance starts from a clean slate — no HTTP samples yet.
    expect(text).not.toContain('http_requests_total{');
  });

  it('exposes the Prometheus content type', () => {
    expect(new MetricsService().contentType).toContain('text/plain');
  });
});
