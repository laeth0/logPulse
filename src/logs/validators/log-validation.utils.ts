import { ISO_8601_TIMESTAMP_PATTERN } from '@/common/constants/log-api.constants';

export function parseIsoTimestamp(value: unknown): Date | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = ISO_8601_TIMESTAMP_PATTERN.exec(value);
  if (!match || !hasValidDateParts(match)) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasValidDateParts(match: RegExpExecArray): boolean {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59
  );
}
