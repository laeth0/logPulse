import type { AggregationBucket } from '@/logs/enums/aggregation-bucket.enum';
import type { AggregationGroup } from '@/logs/enums/aggregation-group.enum';
import type { LogLevel } from '@/logs/enums/log-level.enum';
import type { CursorPayload } from '@/logs/interfaces/cursor-payload.interface';

export interface LogFilters {
  tenantId: string;
  service?: string;
  level?: LogLevel;
  since?: Date;
  until?: Date;
  attributes?: Readonly<Record<string, string>>;
  q?: string;
}

export interface FindLogsQuery extends LogFilters {
  limit: number;
  cursor?: CursorPayload;
}

export interface AggregateLogsQuery extends LogFilters {
  since: Date;
  until: Date;
  bucket: AggregationBucket;
  groupBy?: AggregationGroup;
}
