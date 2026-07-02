import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { AuthenticatedPlayer } from './auth.service';
import { CurrentPlayer } from './current-player.decorator';
import type { RequestWithPlayer } from './jwt-auth.guard';

/** Nest stores custom param factories under this route-args metadata key. */
const ROUTE_ARGS_METADATA = '__routeArguments__';

type ParamFactory = (data: unknown, context: ExecutionContext) => AuthenticatedPlayer;

/**
 * createParamDecorator hides the factory inside route-args metadata, so the
 * test applies the decorator to a probe handler and pulls the factory back
 * out — the same lookup Nest's router performs.
 */
function extractFactory(): ParamFactory {
  class Probe {
    handle(): void {
      // Route handler stub — only its parameter metadata matters.
    }
  }
  CurrentPlayer()(Probe.prototype, 'handle', 0);
  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handle') as Record<
    string,
    { factory: ParamFactory }
  >;
  const entry = Object.values(metadata)[0];
  if (!entry) {
    throw new Error('CurrentPlayer registered no route argument metadata');
  }
  return entry.factory;
}

function contextFor(player?: AuthenticatedPlayer): ExecutionContext {
  const request = { player } as unknown as RequestWithPlayer;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('CurrentPlayer', () => {
  it('returns the player attached by JwtAuthGuard', () => {
    const factory = extractFactory();
    const player: AuthenticatedPlayer = { id: 'tg:7', displayName: 'Dana', kind: 'telegram' };
    expect(factory(undefined, contextFor(player))).toBe(player);
  });

  it('throws 401 when the request was never authenticated', () => {
    const factory = extractFactory();
    expect(() => factory(undefined, contextFor(undefined))).toThrow(UnauthorizedException);
    expect(() => factory(undefined, contextFor(undefined))).toThrow(/request is not authenticated/);
  });
});
