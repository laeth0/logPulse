import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface RequestWithTenantId extends Request {
  tenantId: string;
}

/**
 * Route handler parameter decorator that extracts the authenticated tenant ID
 * from the incoming HTTP request.
 *
 * @example
 * ```ts
 * @Get('profile')
 * getProfile(@CurrentTenantId() tenantId: string) {
 *   return this.tenancyService.getProfile(tenantId);
 * }
 * ```
 */
export const CurrentTenantId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<RequestWithTenantId>();
    return request.tenantId;
  },
);
