import { randomUUID } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_DAYS,
} from '@/common/constants/tenancy.constants';
import type { TenantJwtPayload } from '@/tenancy/interfaces/jwt-payload.interface';

@Injectable()
export class TokenService {
  readonly accessTokenTtlSeconds = ACCESS_TOKEN_TTL_SECONDS;

  constructor(private readonly jwtService: JwtService) {}

  signAccessToken(tenantId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: tenantId, type: 'access' } satisfies TenantJwtPayload,
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
  }

  async verifyAccessToken(token: string): Promise<string> {
    const payload = await this.verify(token, 'invalid or expired access token');

    if (payload.type !== 'access') {
      throw new UnauthorizedException('invalid or expired access token');
    }

    return payload.sub;
  }

  signRefreshToken(tenantId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: tenantId, type: 'refresh' } satisfies TenantJwtPayload,
      {
        expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d`,
        jwtid: randomUUID(),
      },
    );
  }

  async verifyRefreshToken(token: string): Promise<string> {
    const payload = await this.verify(
      token,
      'invalid or expired refresh token',
    );

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('invalid or expired refresh token');
    }

    return payload.sub;
  }

  private async verify(
    token: string,
    errorMessage: string,
  ): Promise<TenantJwtPayload> {
    try {
      return await this.jwtService.verifyAsync<TenantJwtPayload>(token);
    } catch {
      throw new UnauthorizedException(errorMessage);
    }
  }
}
