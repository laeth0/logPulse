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
 * Guards the Tenant account/API-key-management endpoints.
 *
 * MUST NEVER read `process.env.AUTH_ENABLED` or branch on it anywhere —
 * this guard unconditionally validates the Tenant JWT in every deployment
 * configuration, including `AUTH_ENABLED=false`, the default. `AUTH_ENABLED`
 * only gates `ApiKeyAuthGuard` on the log data-plane endpoints; it has no
 * defined meaning here. See research.md Decision 7's "Hard rule" and
 * contracts/api-keys-api.md for the full rationale — copying
 * `ApiKeyAuthGuard`'s `AUTH_ENABLED=false` short-circuit into this guard
 * would silently expose every tenant's key-management endpoints, including
 * reading back full key secrets, with no credential at all.
 */
@Injectable()
export class TenantJwtAuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithTenantId>();
    const credential = extractBearerToken(request);

    if (!credential) {
      throw new UnauthorizedException('missing or malformed credential');
    }

    // An API key never contains '.' (research.md Decision 5); a JWT always
    // does — a cheap shape check that avoids a wasted verify attempt.
    if (!credential.includes('.')) {
      throw new ForbiddenException(
        'this endpoint requires a Tenant access token, not an API key',
      );
    }

    request.tenantId = await this.tokenService.verifyAccessToken(credential);
    return true;
  }
}

function extractBearerToken(request: Request): string | undefined {
  const authorizationHeader = request.headers.authorization;

  if (authorizationHeader?.startsWith('Bearer ')) {
    return authorizationHeader.slice('Bearer '.length).trim() || undefined;
  }

  return undefined;
}
