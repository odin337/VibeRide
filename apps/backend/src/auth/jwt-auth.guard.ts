import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AuthenticatedPlayer } from './auth.service';

/** FastifyRequest carrying the player attached by JwtAuthGuard. */
export interface RequestWithPlayer extends FastifyRequest {
  player?: AuthenticatedPlayer;
}

const BEARER_PREFIX = 'Bearer ';

const jwtPayloadSchema = z.object({
  sub: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['telegram', 'guest']),
});

/** Runtime check of the decoded payload — signature alone does not fix shape. */
export function playerFromJwtPayload(payload: unknown): AuthenticatedPlayer | undefined {
  const result = jwtPayloadSchema.safeParse(payload);
  if (!result.success) {
    return undefined;
  }
  return { id: result.data.sub, displayName: result.data.name, kind: result.data.kind };
}

/**
 * Verifies the `Authorization: Bearer <jwt>` header and attaches the
 * authenticated player to the request for @CurrentPlayer(). Every failure
 * mode is a uniform 401 per docs/API.md.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPlayer>();
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException('missing Bearer token');
    }
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(
        header.slice(BEARER_PREFIX.length),
      );
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }
    const player = playerFromJwtPayload(payload);
    if (!player) {
      throw new UnauthorizedException('malformed token payload');
    }
    request.player = player;
    return true;
  }
}
