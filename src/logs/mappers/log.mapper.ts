import type { LogEntryDto } from '@/logs/dto/requests/log-entry.dto';
import type { AggregateBucketDto } from '@/logs/dto/responses/aggregate-logs-response.dto';
import type { LogResponseDto } from '@/logs/dto/responses/query-logs-response.dto';
import type { Log } from '@/logs/entities/log.entity';
import type { LogAggregation } from '@/logs/interfaces/log-query.interface';
import type {
  LogAttributeValue,
  NewLog,
} from '@/logs/interfaces/log-repository.interface';

export function mapLogEntryToNewLog(entry: LogEntryDto): NewLog {
  return {
    timestamp: new Date(entry.timestamp),
    level: entry.level,
    service: entry.service,
    message: entry.message,
    attributes: entry.attributes,
    attributes_text: Object.fromEntries(
      Object.entries(entry.attributes).map(([key, value]) => [
        key,
        String(value),
      ]),
    ),
  };
}

export function mapLogToResponse(log: Log): LogResponseDto {
  return {
    id: log.id,
    timestamp: log.timestamp.toISOString(),
    level: log.level,
    service: log.service,
    message: log.message,
    attributes: sanitizeStoredAttributes(log.attributes),
  };
}

export function mapAggregationToResponse(
  aggregation: LogAggregation,
): AggregateBucketDto {
  return {
    start: aggregation.start.toISOString(),
    group: aggregation.group,
    count: aggregation.count,
  };
}

function sanitizeStoredAttributes(
  attributes: Record<string, unknown>,
): Record<string, LogAttributeValue> {
  const sanitized: Record<string, LogAttributeValue> = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
