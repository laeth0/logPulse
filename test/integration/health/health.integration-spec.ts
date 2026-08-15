import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import type { HealthStatus } from '@/health/health.types';

import { createIntegrationApp } from '../support/create-integration-app';

interface MigrationRow {
  id: number;
  name: string;
}

describe('GET /health readiness', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createIntegrationApp();
    dataSource = app.get<DataSource>(getDataSourceToken());
  }, 120_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('reports ready through the public endpoint when PostgreSQL is connected and migrated', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    const health = response.body as HealthStatus;

    expect(process.env.AUTH_ENABLED).toBe('true');
    expect(health).toMatchObject({
      status: 'ok',
      database: 'connected',
      migrations: 'applied',
    });
    expect(health.uptime).toEqual(expect.any(Number));
    expect(Number.isNaN(Date.parse(health.timestamp))).toBe(false);
  });

  it('refuses readiness when a configured migration is pending', async () => {
    const [latestMigration] = await dataSource.query<MigrationRow[]>(
      `SELECT id, name
       FROM typeorm_migrations
       ORDER BY id DESC
       LIMIT 1`,
    );

    expect(latestMigration).toBeDefined();
    const pendingName = `${latestMigration.name}_integration_pending`;

    await dataSource.query(
      'UPDATE typeorm_migrations SET name = $1 WHERE id = $2',
      [pendingName, latestMigration.id],
    );

    try {
      await request(app.getHttpServer()).get('/health').expect(503);
    } finally {
      await dataSource.query(
        'UPDATE typeorm_migrations SET name = $1 WHERE id = $2',
        [latestMigration.name, latestMigration.id],
      );
    }
  });
});
