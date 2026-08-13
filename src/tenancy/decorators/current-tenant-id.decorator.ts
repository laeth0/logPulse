import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * `ApiKeyAuthGuard`/`TenantJwtAuthGuard` attach the resolved tenant id to the
 * request before a controller method runs; this type documents that shape
 * for both the guards and this decorator to share.
 */
export interface RequestWithTenantId extends Request {
  tenantId: string;
}

export const CurrentTenantId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<RequestWithTenantId>();
    return request.tenantId;
  },
);
