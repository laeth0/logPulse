import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  API_KEY_HEADER,
  DEFAULT_TENANT_ID,
} from '@/common/constants/tenancy.constants';
import type { RequestWithTenantId } from '@/tenancy/decorators/current-tenant-id.decorator';
import { ApiKeyService } from '@/tenancy/services/api-key.service';

/**
 * Guard that authenticates incoming requests using an active Tenant API Key.
 *
 * Supports credentials supplied via:
 * 1. `Authorization: Bearer <api-key>`
 * 2. `x-api-key: <api-key>`
 *
 * - When `AUTH_ENABLED !== 'true'`, automatically binds `DEFAULT_TENANT_ID`.
 * - Rejects JWT tokens with 403 Forbidden (preventing token misuse).
 * - Attaches the resolved `tenantId` to the Express `Request` object.
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  /**
   * Validates the request's API key credential and populates `request.tenantId`.
   *
   * @param context - The execution context of the incoming request.
   * @throws {UnauthorizedException} If the credential is missing, malformed, invalid, or revoked.
   * @throws {ForbiddenException} If a Tenant JWT access token was provided instead of an API key.
   * @returns A promise resolving to `true` if authentication succeeds.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithTenantId>();

    if (process.env.AUTH_ENABLED !== 'true') {
      request.tenantId = DEFAULT_TENANT_ID;
      return true;
    }

    const credential = extractCredential(request);

    if (!credential) {
      throw new UnauthorizedException('missing or malformed credential');
    }

    if (credential.includes('.')) {
      throw new ForbiddenException(
        'this endpoint requires an API key, not a Tenant access token',
      );
    }

    const tenantId = await this.apiKeyService.resolveActiveKey(credential);

    if (!tenantId) {
      throw new UnauthorizedException('invalid or revoked API key');
    }

    request.tenantId = tenantId;
    return true;
  }
}

/**
 * Extracts raw API key credentials from the request headers.
 * Checks `Authorization: Bearer <key>` first, falling back to `x-api-key: <key>`.
 *
 * @param request - The incoming Express request.
 * @returns The extracted API key string or `undefined` if absent.
 */
function extractCredential(request: Request): string | undefined {
  const authorizationHeader = request.headers.authorization;

  if (authorizationHeader?.startsWith('Bearer ')) {
    return authorizationHeader.slice('Bearer '.length).trim() || undefined;
  }

  const apiKeyHeader = request.headers[API_KEY_HEADER];

  if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim() !== '') {
    return apiKeyHeader.trim();
  }

  return undefined;
}
