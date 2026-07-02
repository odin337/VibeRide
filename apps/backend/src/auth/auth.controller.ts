import { Body, Controller, Inject, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { guestAuthRequestSchema, telegramAuthRequestSchema } from '@viberide/shared';
import type { GuestAuthRequest, TelegramAuthRequest } from '@viberide/shared';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AUTH_SERVICE } from '../common/tokens';
import type { AuthResult, AuthService } from './auth.service';

/**
 * Session token issuance (docs/API.md "Auth"). Both endpoints respond 201
 * and are throttled to 10 requests / 60 s per client — stricter than the
 * global default, matching the documented per-route override.
 */
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('api/auth')
export class AuthController {
  constructor(@Inject(AUTH_SERVICE) private readonly auth: AuthService) {}

  @Post('telegram')
  telegram(
    @Body(new ZodValidationPipe(telegramAuthRequestSchema)) body: TelegramAuthRequest,
  ): Promise<AuthResult> {
    return this.auth.telegram(body);
  }

  @Post('guest')
  guest(
    @Body(new ZodValidationPipe(guestAuthRequestSchema)) body: GuestAuthRequest,
  ): Promise<AuthResult> {
    return this.auth.guest(body);
  }
}
