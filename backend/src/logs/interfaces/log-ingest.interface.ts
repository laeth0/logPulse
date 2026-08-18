import type { LogLevel } from '@/logs/enums/log-level.enum';
import type { LogAttributeValue } from '@/logs/interfaces/log-attribute-value.type';

export interface NewLog {
  tenant_id: string;
  timestamp: Date;
  level: LogLevel;
  service: string;
  message: string;
  attributes: Record<string, LogAttributeValue>;
}
