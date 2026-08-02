import type { Log } from '@/logs/entities/log.entity';
import type { AggregationBucket } from '@/logs/enums/aggregation-bucket.enum';
import type { AggregationGroup } from '@/logs/enums/aggregation-group.enum';
import type { LogLevel } from '@/logs/enums/log-level.enum';
import type { CursorPayload } from '@/logs/interfaces/cursor-payload.interface';

export interface LogFilters {
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

export interface LogPage {
  logs: Log[];
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
