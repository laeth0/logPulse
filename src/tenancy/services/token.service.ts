import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { TenantJwtPayload } from '@/tenancy/interfaces/jwt-payload.interface';

const ACCESS_TOKEN_TTL_SECONDS = Number(
  process.env.JWT_ACCESS_TOKEN_TTL_SECONDS ?? 900,
);
const REFRESH_TOKEN_TTL_DAYS = Number(
  process.env.JWT_REFRESH_TOKEN_TTL_DAYS ?? 7,
);

/**
 * Signs/verifies Tenant access and refresh tokens (research.md Decisions 2,
 * 3). Both token kinds carry a `type` claim so a refresh token can never be
 * accepted where an access token is expected, or vice versa.
 */
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
      { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` },
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
