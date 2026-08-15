import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';

import type { QueryLogsResponseDto } from '@/logs/dto/responses/query-logs-response.dto';
import type { ApiKeyListDto } from '@/tenancy/dto/responses/api-key-list.dto';
import type { AuthTokensDto } from '@/tenancy/dto/responses/auth-tokens.dto';
import type { TenantDto } from '@/tenancy/dto/responses/tenant.dto';
import { ApiKeyStatus } from '@/tenancy/enums/api-key-status.enum';

import { createIntegrationApp } from '../support/create-integration-app';
import { restoreEnvironmentVariable } from '../support/environment';
import { bearer } from '../support/http-auth';
import { buildTenantLog } from '../support/log-fixtures';
import {
  aggregateLogs,
  ingestLogs,
  sumBucketCounts,
} from '../support/logs-api';
import { expectAuthTokens } from '../support/tenancy-assertions';
import {
  createApiKey,
  loginTenant,
  registerAndLogin,
  TEST_PASSWORD,
} from '../support/tenancy-api';

describe('Tenancy API', () => {
  let app: INestApplication | undefined;
  let dataSource: DataSource;
  let httpServer: App;
  let originalAuthEnabled: string | undefined;
  let originalBackpressureEnabled: string | undefined;

  beforeAll(async () => {
    originalAuthEnabled = process.env.AUTH_ENABLED;
    originalBackpressureEnabled = process.env.BACKPRESSURE_ENABLED;
    process.env.AUTH_ENABLED = 'true';
    process.env.BACKPRESSURE_ENABLED = 'false';

    app = await createIntegrationApp();
    dataSource = app.get<DataSource>(getDataSourceToken());
    httpServer = app.getHttpServer() as App;
  }, 120_000);

  beforeEach(async () => {
    process.env.AUTH_ENABLED = 'true';
    await dataSource.query(
      'TRUNCATE TABLE "log_rollups", "logs", "tenant_refresh_tokens", "api_keys", "tenants" CASCADE',
    );
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    restoreEnvironmentVariable('AUTH_ENABLED', originalAuthEnabled);
    restoreEnvironmentVariable(
      'BACKPRESSURE_ENABLED',
      originalBackpressureEnabled,
    );
  });

  it('supports account registration and login while rotating refresh tokens exactly once', async () => {
    process.env.AUTH_ENABLED = 'false';

    const registrationResponse = await request(httpServer)
      .post('/tenants/register')
      .send({
        email: 'Customer@Example.COM',
        password: TEST_PASSWORD,
      })
      .expect(201);
    const tenant = registrationResponse.body as TenantDto;

    expect(tenant.id).toEqual(expect.any(String));
    expect(tenant.email).toBe('customer@example.com');

    await request(httpServer)
      .post('/tenants/register')
      .send({ email: 'customer@example.com', password: TEST_PASSWORD })
      .expect(409, { error: 'email is already registered' });

    const invalidCredentialResponse = {
      error: 'invalid email or password',
    };
    await request(httpServer)
      .post('/tenants/login')
      .send({ email: tenant.email, password: 'wrong-password' })
      .expect(401, invalidCredentialResponse);
    await request(httpServer)
      .post('/tenants/login')
      .send({ email: 'unknown@example.com', password: 'wrong-password' })
      .expect(401, invalidCredentialResponse);

    const initialTokens = await loginTenant(
      httpServer,
      tenant.email,
      TEST_PASSWORD,
    );
    expectAuthTokens(initialTokens);

    const refreshResponse = await request(httpServer)
      .post('/tenants/refresh')
      .send({ refresh_token: initialTokens.refresh_token })
      .expect(200);
    const rotatedTokens = refreshResponse.body as AuthTokensDto;

    expectAuthTokens(rotatedTokens);
    expect(rotatedTokens.refresh_token).not.toBe(initialTokens.refresh_token);

    await request(httpServer)
      .post('/tenants/refresh')
      .send({ refresh_token: initialTokens.refresh_token })
      .expect(401, { error: 'invalid or expired refresh token' });
  });

  it('keeps API-key management JWT-protected, tenant-owned, and immediately revocable', async () => {
    process.env.AUTH_ENABLED = 'false';
    const tenantA = await registerAndLogin(httpServer, 'owner-a@example.com');
    const tenantB = await registerAndLogin(httpServer, 'owner-b@example.com');

    await request(httpServer)
      .get('/tenants/api-keys')
      .expect(401, { error: 'missing or malformed credential' });

    const keyA = await createApiKey(httpServer, tenantA.tokens.access_token);
    const keyB = await createApiKey(httpServer, tenantB.tokens.access_token);

    await request(httpServer)
      .get('/tenants/api-keys')
      .set('Authorization', bearer(keyA.key))
      .expect(403, {
        error: 'this endpoint requires a Tenant access token, not an API key',
      });

    const listResponse = await request(httpServer)
      .get('/tenants/api-keys')
      .set('Authorization', bearer(tenantA.tokens.access_token))
      .expect(200);
    const tenantAKeys = listResponse.body as ApiKeyListDto;

    expect(tenantAKeys.api_keys).toEqual([keyA]);
    expect(tenantAKeys.api_keys).not.toContainEqual(
      expect.objectContaining({ id: keyB.id }),
    );

    await request(httpServer)
      .delete(`/tenants/api-keys/${keyB.id}`)
      .set('Authorization', bearer(tenantA.tokens.access_token))
      .expect(404, { error: 'API key not found' });

    const revokedKey = { id: keyA.id, status: ApiKeyStatus.REVOKED };
    await request(httpServer)
      .delete(`/tenants/api-keys/${keyA.id}`)
      .set('Authorization', bearer(tenantA.tokens.access_token))
      .expect(200, revokedKey);
    await request(httpServer)
      .delete(`/tenants/api-keys/${keyA.id}`)
      .set('Authorization', bearer(tenantA.tokens.access_token))
      .expect(200, revokedKey);

    process.env.AUTH_ENABLED = 'true';
    await request(httpServer)
      .get('/logs')
      .set('Authorization', bearer(keyA.key))
      .expect(401, { error: 'invalid or revoked API key' });
    await request(httpServer)
      .get('/logs')
      .set('Authorization', bearer(keyB.key))
      .expect(200);
  });

  it('isolates log ingestion, queries, aggregation, and cursor reuse by tenant', async () => {
    const tenantA = await registerAndLogin(httpServer, 'data-a@example.com');
    const tenantB = await registerAndLogin(httpServer, 'data-b@example.com');
    const keyA = await createApiKey(httpServer, tenantA.tokens.access_token);
    const keyB = await createApiKey(httpServer, tenantB.tokens.access_token);

    await request(httpServer)
      .get('/logs')
      .expect(401, { error: 'missing or malformed credential' });
    await request(httpServer)
      .get('/logs')
      .set('Authorization', bearer(tenantA.tokens.access_token))
      .expect(403, {
        error: 'this endpoint requires an API key, not a Tenant access token',
      });

    const now = Date.now();
    const since = new Date(now - 5 * 60_000);
    const until = new Date(now + 5_000);
    await ingestLogs(httpServer, keyA.key, [
      buildTenantLog('tenant A older', new Date(now - 120_000)),
      buildTenantLog('tenant A newer', new Date(now - 60_000)),
    ]);
    await ingestLogs(httpServer, keyB.key, [
      buildTenantLog('tenant B only', new Date(now - 90_000)),
    ]);

    const tenantAQueryResponse = await request(httpServer)
      .get('/logs')
      .set('Authorization', bearer(keyA.key))
      .query({ limit: '1' })
      .expect(200);
    const tenantAQuery = tenantAQueryResponse.body as QueryLogsResponseDto;

    expect(tenantAQuery.logs.map(({ message }) => message)).toEqual([
      'tenant A newer',
    ]);
    expect(tenantAQuery.next_cursor).toEqual(expect.any(String));

    const tenantBQueryResponse = await request(httpServer)
      .get('/logs')
      .set('Authorization', bearer(keyB.key))
      .expect(200);
    const tenantBQuery = tenantBQueryResponse.body as QueryLogsResponseDto;

    expect(tenantBQuery.logs.map(({ message }) => message)).toEqual([
      'tenant B only',
    ]);

    const crossTenantCursorResponse = await request(httpServer)
      .get('/logs')
      .set('Authorization', bearer(keyB.key))
      .query({ cursor: tenantAQuery.next_cursor })
      .expect(200);
    const crossTenantCursor =
      crossTenantCursorResponse.body as QueryLogsResponseDto;

    expect(
      crossTenantCursor.logs.every(({ message }) =>
        message.startsWith('tenant B'),
      ),
    ).toBe(true);

    const [tenantAAggregation, tenantBAggregation] = await Promise.all([
      aggregateLogs(httpServer, keyA.key, since, until),
      aggregateLogs(httpServer, keyB.key, since, until),
    ]);

    expect(sumBucketCounts(tenantAAggregation)).toBe(2);
    expect(sumBucketCounts(tenantBAggregation)).toBe(1);
  });
});
