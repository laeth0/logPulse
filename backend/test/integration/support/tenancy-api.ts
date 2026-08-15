import request from 'supertest';
import type { App } from 'supertest/types';

import type { ApiKeyDto } from '@/tenancy/dto/responses/api-key.dto';
import type { AuthTokensDto } from '@/tenancy/dto/responses/auth-tokens.dto';
import type { TenantDto } from '@/tenancy/dto/responses/tenant.dto';

import { bearer } from './http-auth';

export const TEST_PASSWORD = 'integration-password';

export interface TenantSession {
  tenant: TenantDto;
  tokens: AuthTokensDto;
}

export async function registerAndLogin(
  httpServer: App,
  email: string,
): Promise<TenantSession> {
  const registrationResponse = await request(httpServer)
    .post('/tenants/register')
    .send({ email, password: TEST_PASSWORD })
    .expect(201);
  const tenant = registrationResponse.body as TenantDto;
  const tokens = await loginTenant(httpServer, email, TEST_PASSWORD);
  return { tenant, tokens };
}

export async function loginTenant(
  httpServer: App,
  email: string,
  password: string,
): Promise<AuthTokensDto> {
  const response = await request(httpServer)
    .post('/tenants/login')
    .send({ email, password })
    .expect(200);
  return response.body as AuthTokensDto;
}

export async function createApiKey(
  httpServer: App,
  accessToken: string,
): Promise<ApiKeyDto> {
  const response = await request(httpServer)
    .post('/tenants/api-keys')
    .set('Authorization', bearer(accessToken))
    .send({})
    .expect(201);
  return response.body as ApiKeyDto;
}
