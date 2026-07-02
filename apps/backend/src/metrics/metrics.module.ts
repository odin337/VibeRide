import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { METRICS_SERVICE } from '../common/tokens';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

@Module({
  controllers: [MetricsController],
  providers: [
    { provide: METRICS_SERVICE, useClass: MetricsService },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class MetricsModule {}
