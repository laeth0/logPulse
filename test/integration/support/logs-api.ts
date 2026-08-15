import request from 'supertest';
import type { App } from 'supertest/types';

import type { LogEntryDto } from '@/logs/dto/requests/log-entry.dto';
import type { AggregateLogsResponseDto } from '@/logs/dto/responses/aggregate-logs-response.dto';

import { bearer } from './http-auth';

export async function ingestLogs(
  httpServer: App,
  apiKey: string,
  logs: readonly LogEntryDto[],
): Promise<void> {
  await request(httpServer)
    .post('/logs')
    .set('Authorization', bearer(apiKey))
    .send({ logs })
    .expect(200, { accepted: logs.length, rejected: [] });
}

export async function aggregateLogs(
  httpServer: App,
  apiKey: string,
  since: Date,
  until: Date,
): Promise<AggregateLogsResponseDto> {
  const response = await request(httpServer)
    .get('/logs/aggregate')
    .set('Authorization', bearer(apiKey))
    .query({
      since: since.toISOString(),
      until: until.toISOString(),
      bucket: '1m',
    })
    .expect(200);
  return response.body as AggregateLogsResponseDto;
}

export function sumBucketCounts(aggregation: AggregateLogsResponseDto): number {
  return aggregation.buckets.reduce((sum, bucket) => sum + bucket.count, 0);
}
