import bytes from 'bytes';

import {
  DEFAULT_BACKPRESSURE_MAX_PENDING_BYTES,
  DEFAULT_BACKPRESSURE_MAX_PENDING_ROWS,
  DEFAULT_BACKPRESSURE_RETRY_AFTER_SECONDS,
} from '@/common/constants/log-api.constants';

export interface BackpressureConfig {
  readonly enabled: boolean;
  readonly maxPendingRows: number;
  readonly maxPendingBytes: number;
  readonly retryAfterSeconds: number;
}

/**
 * Reads and validates the optional backpressure configuration from environment
 * variables. Validation only runs when `BACKPRESSURE_ENABLED=true` — a malformed
 * value for an otherwise-unused knob must never block the zero-config default
 * (FR-002). Throws immediately on a malformed value so a bad config fails at
 * startup, not silently on the first request (research.md Decision 6).
 */
export function createBackpressureConfig(): BackpressureConfig {
  const enabled = process.env.BACKPRESSURE_ENABLED === 'true';

  const maxPendingRows = parsePositiveInteger(
    'BACKPRESSURE_MAX_PENDING_ROWS',
    process.env.BACKPRESSURE_MAX_PENDING_ROWS,
    DEFAULT_BACKPRESSURE_MAX_PENDING_ROWS,
    enabled,
  );

  const maxPendingBytes = parseByteSize(
    'BACKPRESSURE_MAX_PENDING_BYTES',
    process.env.BACKPRESSURE_MAX_PENDING_BYTES,
    DEFAULT_BACKPRESSURE_MAX_PENDING_BYTES,
    enabled,
  );

  const retryAfterSeconds = parsePositiveInteger(
    'BACKPRESSURE_RETRY_AFTER_SECONDS',
    process.env.BACKPRESSURE_RETRY_AFTER_SECONDS,
    DEFAULT_BACKPRESSURE_RETRY_AFTER_SECONDS,
    enabled,
  );

  return { enabled, maxPendingRows, maxPendingBytes, retryAfterSeconds };
}

function parsePositiveInteger(
  variableName: string,
  rawValue: string | undefined,
  defaultValue: number,
  validate: boolean,
): number {
  if (rawValue === undefined) {
    return defaultValue;
  }

  const parsed = Number(rawValue);

  if (validate && (!Number.isFinite(parsed) || parsed <= 0)) {
    throw new Error(
      `${variableName} must be a positive number, got: '${rawValue}'`,
    );
  }

  return parsed;
}

function parseByteSize(
  variableName: string,
  rawValue: string | undefined,
  defaultValue: string,
  validate: boolean,
): number {
  const parsed = bytes.parse(rawValue ?? defaultValue);

  if (validate && (parsed === null || parsed <= 0)) {
    throw new Error(
      `${variableName} must be a valid size string (e.g. '25mb'), got: '${rawValue}'`,
    );
  }

  return parsed ?? 0;
}
