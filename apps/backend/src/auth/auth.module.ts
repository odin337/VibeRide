import { Module } from '@nestjs/common';

import { AUTH_SERVICE } from '../common/tokens';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [{ provide: AUTH_SERVICE, useClass: AuthService }],
})
export class AuthModule {}
