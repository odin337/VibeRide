import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { GuestAuthRequest, TelegramAuthRequest } from '@viberide/shared';

import { APP_ENV } from '../common/tokens';
import type { Env } from '../config/env';
import { validateInitData } from './telegram-init-data';

/** The authenticated identity carried by the session JWT. */
export interface AuthenticatedPlayer {
  readonly id: string;
  readonly displayName: string;
  readonly kind: 'telegram' | 'guest';
}

/** Response shape of both auth endpoints (docs/API.md `AuthResponse`). */
export interface AuthResult {
  readonly token: string;
  readonly player: AuthenticatedPlayer;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  /** Stateless guest session: the same deviceId always resumes the same id. */
  async guest(request: GuestAuthRequest): Promise<AuthResult> {
    const player: AuthenticatedPlayer = {
      id: `guest:${request.deviceId}`,
      displayName: request.displayName,
      kind: 'guest',
    };
    return { token: await this.sign(player), player };
  }

  /**
   * Exchanges Telegram Mini App initData for a session. Identity claims are
   * trusted only after the HMAC signature and auth_date freshness checks
   * pass (validateInitData). Without a configured bot token the endpoint is
   * unavailable rather than insecure.
   */
  async telegram(
    request: TelegramAuthRequest,
    nowSec: number = Math.floor(Date.now() / 1000),
  ): Promise<AuthResult> {
    const configuredBotToken = this.env.telegramBotToken;
    if (configuredBotToken === undefined) {
      throw new ServiceUnavailableException(
        'Telegram authentication is not available: TELEGRAM_BOT_TOKEN is not configured ' +
          'on this server (see apps/backend/.env.example)',
      );
    }
    const result = validateInitData(request.initData, configuredBotToken, nowSec);
    if (!result.ok) {
      throw new UnauthorizedException(`invalid Telegram initData: ${result.reason}`);
    }
    const displayName = result.user.firstName ?? result.user.username ?? `Player ${result.user.id}`;
    const player: AuthenticatedPlayer = {
      id: `tg:${result.user.id}`,
      displayName,
      kind: 'telegram',
    };
    return { token: await this.sign(player), player };
  }

  private sign(player: AuthenticatedPlayer): Promise<string> {
    return this.jwt.signAsync({ sub: player.id, name: player.displayName, kind: player.kind });
  }
}
