import type {
  AggregateLogsQuery,
  FindLogsQuery,
} from '@/logs/interfaces/log-query.interface';
import type {
  LogAggregation,
  LogPage,
} from '@/logs/interfaces/log-result.interface';
import type { NewLog } from '@/logs/interfaces/log-ingest.interface';

export interface LogRepositoryContract {
  insertMany(logs: readonly NewLog[]): Promise<void>;
  findPage(query: FindLogsQuery): Promise<LogPage>;
  aggregate(query: AggregateLogsQuery): Promise<LogAggregation[]>;
}
