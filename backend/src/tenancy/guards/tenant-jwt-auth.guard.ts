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

@Injectable()
export class TenantJwtAuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

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

function extractBearerToken(request: Request): string | undefined {
  const authorizationHeader = request.headers.authorization;

  if (authorizationHeader?.startsWith('Bearer ')) {
    return authorizationHeader.slice('Bearer '.length).trim() || undefined;
  }

  return undefined;
}
