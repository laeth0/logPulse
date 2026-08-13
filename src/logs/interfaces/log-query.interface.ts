import type { AggregationBucket } from '@/logs/enums/aggregation-bucket.enum';
import type { AggregationGroup } from '@/logs/enums/aggregation-group.enum';
import type { LogLevel } from '@/logs/enums/log-level.enum';
import type { CursorPayload } from '@/logs/interfaces/cursor-payload.interface';
import type { LogAttributeValue } from '@/logs/interfaces/log-repository.interface';

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

/** Raw `getRawMany()` row shape for a page of `logs` — see log-query.builder.ts's explicit column aliases. */
export interface RawLogRow {
  id: string;
  timestamp: Date;
  level: LogLevel;
  service: string;
  message: string;
  attributes: Record<string, LogAttributeValue>;
}

export interface LogPage {
  logs: RawLogRow[];
  hasMore: boolean;
}

export interface AggregateLogsQuery extends LogFilters {
  since: Date;
  until: Date;
  bucket: AggregationBucket;
  groupBy?: AggregationGroup;
}

export interface LogAggregation {
  start: Date;
  group: string | null;
  count: number;
}

export interface RawLogAggregation {
  start: Date;
  group: string | null;
  count: string;
}
