import { Module } from '@nestjs/common';

import { HEALTH_SERVICE } from '../common/tokens';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [{ provide: HEALTH_SERVICE, useClass: HealthService }],
})
export class HealthModule {}
