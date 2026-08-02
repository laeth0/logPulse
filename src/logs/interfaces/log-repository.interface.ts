import type { LogLevel } from '@/logs/enums/log-level.enum';
import type {
  AggregateLogsQuery,
  FindLogsQuery,
  LogAggregation,
  LogPage,
} from '@/logs/interfaces/log-query.interface';

export type LogAttributeValue = string | number | boolean;

export interface NewLog {
  timestamp: Date;
  level: LogLevel;
  service: string;
  message: string;
  attributes: Record<string, LogAttributeValue>;
  attributes_text: Record<string, string>;
}

export interface LogRepositoryContract {
  insertMany(logs: readonly NewLog[]): Promise<void>;
  findPage(query: FindLogsQuery): Promise<LogPage>;
  aggregate(query: AggregateLogsQuery): Promise<LogAggregation[]>;
}
