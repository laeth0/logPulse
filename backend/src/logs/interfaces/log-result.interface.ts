import type { LogLevel } from '@/logs/enums/log-level.enum';
import type { LogAttributeValue } from '@/logs/interfaces/log-attribute-value.type';

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
