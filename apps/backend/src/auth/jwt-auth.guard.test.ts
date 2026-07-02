import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';

import { JwtAuthGuard, playerFromJwtPayload } from './jwt-auth.guard';
import type { RequestWithPlayer } from './jwt-auth.guard';

const SECRET = 'unit-test-jwt-secret-with-32-chars!!!!!!';
const jwt = new JwtService({ secret: SECRET });
const guard = new JwtAuthGuard(jwt);

const PAYLOAD = { sub: 'guest:device-1', name: 'Rider', kind: 'guest' } as const;

function contextFor(authorization?: string): {
  context: ExecutionContext;
  request: RequestWithPlayer;
} {
  const request = { headers: { authorization } } as unknown as RequestWithPlayer;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('playerFromJwtPayload', () => {
  it('maps a well-formed payload to the authenticated player', () => {
    expect(playerFromJwtPayload({ ...PAYLOAD, iat: 123, exp: 456 })).toEqual({
      id: 'guest:device-1',
      displayName: 'Rider',
      kind: 'guest',
    });
  });

  it('rejects payloads missing claims, with bad kinds, or non-objects', () => {
    expect(playerFromJwtPayload({ sub: 'x', name: 'y' })).toBeUndefined();
    expect(playerFromJwtPayload({ sub: '', name: 'y', kind: 'guest' })).toBeUndefined();
    expect(playerFromJwtPayload({ sub: 'x', name: 'y', kind: 'admin' })).toBeUndefined();
    expect(playerFromJwtPayload('not-an-object')).toBeUndefined();
    expect(playerFromJwtPayload(null)).toBeUndefined();
  });
});

describe('JwtAuthGuard', () => {
  it('rejects requests without an Authorization header', async () => {
    const { context } = contextFor(undefined);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow(/missing Bearer token/);
  });

  it('rejects non-Bearer authorization schemes', async () => {
    const { context } = contextFor('Basic dXNlcjpwYXNz');
    await expect(guard.canActivate(context)).rejects.toThrow(/missing Bearer token/);
  });

  it('rejects unverifiable tokens', async () => {
    const { context } = contextFor('Bearer not.a.jwt');
    await expect(guard.canActivate(context)).rejects.toThrow(/invalid or expired token/);
  });

  it('rejects tokens signed with a different secret', async () => {
    const otherJwt = new JwtService({ secret: 'a-completely-different-32-char-secret!!!' });
    const token = await otherJwt.signAsync({ ...PAYLOAD });
    const { context } = contextFor(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(/invalid or expired token/);
  });

  it('rejects expired tokens', async () => {
    const token = await jwt.signAsync({ ...PAYLOAD }, { expiresIn: -10 });
    const { context } = contextFor(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(/invalid or expired token/);
  });

  it('rejects validly signed tokens whose payload has the wrong shape', async () => {
    const token = await jwt.signAsync({ sub: 'guest:device-1' });
    const { context } = contextFor(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(/malformed token payload/);
  });

  it('attaches the authenticated player and lets valid requests through', async () => {
    const token = await jwt.signAsync({ ...PAYLOAD });
    const { context, request } = contextFor(`Bearer ${token}`);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.player).toEqual({
      id: 'guest:device-1',
      displayName: 'Rider',
      kind: 'guest',
    });
  });
});
