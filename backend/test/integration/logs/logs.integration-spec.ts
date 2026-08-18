import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';

import type { AggregateLogsResponseDto } from '@/logs/dto/responses/aggregate-logs-response.dto';
import type { IngestLogsResponseDto } from '@/logs/dto/responses/ingest-logs-response.dto';
import type { QueryLogsResponseDto } from '@/logs/dto/responses/query-logs-response.dto';
import { LogLevel } from '@/logs/enums/log-level.enum';

import { createIntegrationApp } from '../support/create-integration-app';
import { restoreEnvironmentVariable } from '../support/environment';
import { alignToMinute, buildLog } from '../support/log-fixtures';

describe('Logs API', () => {
  let app: INestApplication | undefined;
  let dataSource: DataSource;
  let httpServer: App;
  let originalAuthEnabled: string | undefined;

  beforeAll(async () => {
    originalAuthEnabled = process.env.AUTH_ENABLED;
    process.env.AUTH_ENABLED = 'false';

    app = await createIntegrationApp();
    dataSource = app.get<DataSource>(getDataSourceToken());
    httpServer = app.getHttpServer() as App;
  }, 120_000);

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "log_rollups", "logs"');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    restoreEnvironmentVariable('AUTH_ENABLED', originalAuthEnabled);
  });

  it('accepts valid entries from a mixed batch and never persists rejected entries', async () => {
    const timestamp = new Date(Date.now() - 60_000);
    const validEntries = [
      buildLog({
        timestamp: timestamp.toISOString(),
        message: 'first accepted entry',
      }),
      buildLog({
        timestamp: new Date(timestamp.getTime() + 1_000).toISOString(),
        level: LogLevel.WARN,
        message: 'second accepted entry',
      }),
    ];
    const rejectedEntry = {
      ...buildLog({
        timestamp: new Date(timestamp.getTime() + 500).toISOString(),
        message: 'rejected entry',
      }),
      level: 'critical',
    };

    const mixedResponse = await request(httpServer)
      .post('/logs')
      .send({ logs: [validEntries[0], rejectedEntry, validEntries[1]] })
      .expect(200);
    const mixedResult = mixedResponse.body as IngestLogsResponseDto;

    expect(mixedResult.accepted).toBe(2);
    expect(mixedResult.rejected).toHaveLength(1);
    expect(mixedResult.rejected[0].index).toBe(1);
    expect(mixedResult.rejected[0].reason).toContain('level');

    const allInvalidResponse = await request(httpServer)
      .post('/logs')
      .send({
        logs: [
          { ...buildLog(), level: 'critical' },
          { ...buildLog(), message: '' },
        ],
      })
      .expect(400);
    const allInvalidResult = allInvalidResponse.body as IngestLogsResponseDto;

    expect(allInvalidResult.accepted).toBe(0);
    expect(allInvalidResult.rejected.map(({ index }) => index)).toEqual([0, 1]);

    const queryResponse = await request(httpServer).get('/logs').expect(200);
    const queryResult = queryResponse.body as QueryLogsResponseDto;

    expect(queryResult.logs.map(({ message }) => message)).toEqual([
      'second accepted entry',
      'first accepted entry',
    ]);
    expect(queryResult.next_cursor).toBeNull();
  });

  it('combines filters and paginates equal timestamps without gaps or duplicates', async () => {
    const timestamp = new Date(Date.now() - 5 * 60_000);
    const sharedTimestamp = timestamp.toISOString();
    const entries = [
      buildLog({
        timestamp: sharedTimestamp,
        message: 'Payment retry accepted: older id',
        attributes: { retries: 3, region: 'eu-west' },
      }),
      buildLog({
        timestamp: sharedTimestamp,
        message: 'payment RETRY accepted: newer id',
        attributes: { retries: 3, region: 'eu-west' },
      }),
      buildLog({
        timestamp: sharedTimestamp,
        message: 'Payment retry accepted: wrong attribute',
        attributes: { retries: '03', region: 'eu-west' },
      }),
      buildLog({
        timestamp: sharedTimestamp,
        service: 'billing',
        message: 'Payment retry accepted: wrong service',
        attributes: { retries: 3, region: 'eu-west' },
      }),
    ];

    await request(httpServer)
      .post('/logs')
      .send({ logs: entries })
      .expect(200, { accepted: 4, rejected: [] });

    const filters = {
      service: 'checkout',
      level: LogLevel.ERROR,
      since: sharedTimestamp,
      until: new Date(timestamp.getTime() + 1_000).toISOString(),
      'attr.retries': '3',
      q: 'PAYMENT RETRY',
      limit: '1',
    };
    const firstPageResponse = await request(httpServer)
      .get('/logs')
      .query(filters)
      .expect(200);
    const firstPage = firstPageResponse.body as QueryLogsResponseDto;

    expect(firstPage.logs.map(({ message }) => message)).toEqual([
      'payment RETRY accepted: newer id',
    ]);
    expect(firstPage.next_cursor).toEqual(expect.any(String));

    const secondPageResponse = await request(httpServer)
      .get('/logs')
      .query({ ...filters, cursor: firstPage.next_cursor })
      .expect(200);
    const secondPage = secondPageResponse.body as QueryLogsResponseDto;

    expect(secondPage.logs.map(({ message }) => message)).toEqual([
      'Payment retry accepted: older id',
    ]);
    expect(secondPage.next_cursor).toBeNull();
    expect(secondPage.logs[0].id).not.toBe(firstPage.logs[0].id);

    const invalidCursorResponse = await request(httpServer)
      .get('/logs')
      .query({ cursor: 'not-a-valid-cursor' })
      .expect(400);

    const invalidCursorResult = invalidCursorResponse.body as {
      error: unknown;
    };
    expect(invalidCursorResult.error).toEqual(expect.any(String));
  });

  it('returns persisted counts grouped into ascending time buckets', async () => {
    const bucketStart = alignToMinute(new Date(Date.now() - 10 * 60_000));
    const nextBucketStart = new Date(bucketStart.getTime() + 60_000);
    const until = new Date(bucketStart.getTime() + 2 * 60_000);
    const entries = [
      buildLog({
        timestamp: new Date(bucketStart.getTime() + 5_000).toISOString(),
        service: 'checkout',
      }),
      buildLog({
        timestamp: new Date(bucketStart.getTime() + 35_000).toISOString(),
        service: 'checkout',
      }),
      buildLog({
        timestamp: new Date(bucketStart.getTime() + 45_000).toISOString(),
        service: 'billing',
        level: LogLevel.INFO,
      }),
      buildLog({
        timestamp: new Date(nextBucketStart.getTime() + 10_000).toISOString(),
        service: 'checkout',
        level: LogLevel.WARN,
      }),
    ];

    await request(httpServer)
      .post('/logs')
      .send({ logs: entries })
      .expect(200, { accepted: 4, rejected: [] });

    const aggregationResponse = await request(httpServer)
      .get('/logs/aggregate')
      .query({
        since: bucketStart.toISOString(),
        until: until.toISOString(),
        bucket: '1m',
        group_by: 'service',
      })
      .expect(200);
    const aggregation = aggregationResponse.body as AggregateLogsResponseDto;
    const bucketCounts = new Map(
      aggregation.buckets.map(({ start, group, count }) => [
        `${start}|${group ?? ''}`,
        count,
      ]),
    );

    expect(aggregation.buckets).toHaveLength(3);
    expect(aggregation.buckets.map(({ start }) => start)).toEqual(
      [...aggregation.buckets]
        .sort((left, right) => left.start.localeCompare(right.start))
        .map(({ start }) => start),
    );
    expect(bucketCounts).toEqual(
      new Map([
        [`${bucketStart.toISOString()}|checkout`, 2],
        [`${bucketStart.toISOString()}|billing`, 1],
        [`${nextBucketStart.toISOString()}|checkout`, 1],
      ]),
    );
  });
});
