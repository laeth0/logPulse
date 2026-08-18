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

export function createBackpressureConfig(): BackpressureConfig {
  const enabled = process.env.BACKPRESSURE_ENABLED === 'true';

  const maxPendingRows =
    process.env.BACKPRESSURE_MAX_PENDING_ROWS !== undefined
      ? Number(process.env.BACKPRESSURE_MAX_PENDING_ROWS)
      : DEFAULT_BACKPRESSURE_MAX_PENDING_ROWS;

  const maxPendingBytes =
    bytes.parse(
      process.env.BACKPRESSURE_MAX_PENDING_BYTES ??
        DEFAULT_BACKPRESSURE_MAX_PENDING_BYTES,
    ) ?? 0;

  const retryAfterSeconds =
    process.env.BACKPRESSURE_RETRY_AFTER_SECONDS !== undefined
      ? Number(process.env.BACKPRESSURE_RETRY_AFTER_SECONDS)
      : DEFAULT_BACKPRESSURE_RETRY_AFTER_SECONDS;

  return { enabled, maxPendingRows, maxPendingBytes, retryAfterSeconds };
}
