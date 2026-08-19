import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import type { RequestWithTenantId } from '@/tenancy/decorators/current-tenant-id.decorator';
import { TokenService } from '@/tenancy/services/token.service';

/**
 * Guard that enforces JWT access token authentication for Tenant management endpoints.
 *
 * - Expects a signed JWT in the `Authorization: Bearer <jwt>` header.
 * - Rejects raw API keys with 403 Forbidden.
 * - Validates the token type is `'access'` and binds `tenantId` to the request.
 */
@Injectable()
export class TenantJwtAuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  /**
   * Validates the request's JWT access token and populates `request.tenantId`.
   *
   * @param context - The execution context of the incoming request.
   * @throws {UnauthorizedException} If the token is missing, malformed, invalid, or expired.
   * @throws {ForbiddenException} If an API key was provided instead of a Tenant access token.
   * @returns A promise resolving to `true` if authentication succeeds.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithTenantId>();
    const credential = extractBearerToken(request);

    if (!credential) {
      throw new UnauthorizedException('missing or malformed credential');
    }

    if (!credential.includes('.')) {
      throw new ForbiddenException(
        'this endpoint requires a Tenant access token, not an API key',
      );
    }

    request.tenantId = await this.tokenService.verifyAccessToken(credential);
    return true;
  }
}

/**
 * Extracts a Bearer token string from the `Authorization` header.
 *
 * @param request - The incoming Express request.
 * @returns The extracted token string or `undefined` if absent/malformed.
 */
function extractBearerToken(request: Request): string | undefined {
  const authorizationHeader = request.headers.authorization;

  if (authorizationHeader?.startsWith('Bearer ')) {
    return authorizationHeader.slice('Bearer '.length).trim() || undefined;
  }

  return undefined;
}
