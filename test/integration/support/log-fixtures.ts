import type { LogEntryDto } from '@/logs/dto/requests/log-entry.dto';
import { LogLevel } from '@/logs/enums/log-level.enum';

export function buildLog(overrides: Partial<LogEntryDto> = {}): LogEntryDto {
  return {
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    level: LogLevel.ERROR,
    service: 'checkout',
    message: 'payment failed',
    attributes: { retries: 3 },
    ...overrides,
  };
}

export function buildTenantLog(message: string, timestamp: Date): LogEntryDto {
  return buildLog({
    timestamp: timestamp.toISOString(),
    level: LogLevel.INFO,
    service: 'tenancy-integration',
    message,
    attributes: {},
  });
}

export function alignToMinute(value: Date): Date {
  const aligned = new Date(value);
  aligned.setUTCSeconds(0, 0);
  return aligned;
}
