import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';

/**
 * Readiness state. With in-memory persistence there are no external
 * dependencies to probe, so the app is ready from module init until
 * shutdown begins — at which point /health/ready flips to 503 so load
 * balancers drain traffic before the process exits.
 */
@Injectable()
export class HealthService implements OnApplicationShutdown {
  private ready = true;

  onApplicationShutdown(): void {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }
}
