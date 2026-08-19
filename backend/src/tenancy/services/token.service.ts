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

  /**
   * Generates a signed JWT access token for the given tenant ID.
   *
   * @param tenantId - The unique identifier of the tenant.
   * @returns A promise that resolves to the signed JWT access token string.
   */
  signAccessToken(tenantId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: tenantId, type: 'access' } satisfies TenantJwtPayload,
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
  }

  /**
   * Verifies an access token and extracts the tenant ID.
   *
   * @param token - The raw JWT access token to verify.
   * @throws {UnauthorizedException} If the token is invalid, expired, or not of type `access`.
   * @returns The tenant ID (`sub`) extracted from the token payload.
   */
  async verifyAccessToken(token: string): Promise<string> {
    const payload = await this.verify(token, 'invalid or expired access token');

    if (payload.type !== 'access') {
      throw new UnauthorizedException('invalid or expired access token');
    }

    return payload.sub;
  }

  /**
   * Generates a signed JWT refresh token with a unique UUID for the given tenant ID.
   *
   * @param tenantId - The unique identifier of the tenant.
   * @returns A promise that resolves to the signed JWT refresh token string.
   */
  signRefreshToken(tenantId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: tenantId, type: 'refresh' } satisfies TenantJwtPayload,
      {
        expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d`,
        jwtid: randomUUID(),
      },
    );
  }

  /**
   * Verifies a refresh token and extracts the tenant ID.
   *
   * @param token - The raw JWT refresh token to verify.
   * @throws {UnauthorizedException} If the token is invalid, expired, or not of type `refresh`.
   * @returns The tenant ID (`sub`) extracted from the token payload.
   */
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

  /**
   * Internal helper to verify a JWT token and map verification failures to UnauthorizedException.
   *
   * @param token - The raw JWT token string.
   * @param errorMessage - Custom error message for unauthorized exception.
   * @throws {UnauthorizedException} If verification fails.
   * @returns The decoded TenantJwtPayload.
   */
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
