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

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

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
