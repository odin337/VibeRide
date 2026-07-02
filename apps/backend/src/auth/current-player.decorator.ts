import { createParamDecorator, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import type { AuthenticatedPlayer } from './auth.service';
import type { RequestWithPlayer } from './jwt-auth.guard';

/**
 * Injects the AuthenticatedPlayer attached by JwtAuthGuard. Throwing here
 * is a defensive backstop — routes using this decorator must also apply
 * @UseGuards(JwtAuthGuard), which performs the real authentication.
 */
export const CurrentPlayer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPlayer => {
    const request = context.switchToHttp().getRequest<RequestWithPlayer>();
    if (!request.player) {
      throw new UnauthorizedException('request is not authenticated');
    }
    return request.player;
  },
);
