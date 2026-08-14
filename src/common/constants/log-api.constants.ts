export const DEFAULT_LOG_QUERY_LIMIT = 100;
export const MAX_LOG_QUERY_LIMIT = 1000;
export const MAX_FUTURE_TIMESTAMP_OFFSET_MS = 5 * 60 * 1000;
export const ATTRIBUTE_QUERY_PREFIX = 'attr.';
export const MAX_LOG_ID = 9_223_372_036_854_775_807n;
export const LOG_ID_PATTERN = /^[1-9]\d{0,18}$/;

// Write-coalescing tuning (specs/002-performance-optimization research.md Decisions 1-2).
// Env-overridable via INGEST_COALESCE_WINDOW_MS / INGEST_COALESCE_MAX_ROWS — these are
// starting defaults pending measurement (FR-015), not fixed values. A single caller's own
// batch is never split to stay under the row cap; see research.md Decision 1's "F1" note.
export const DEFAULT_INGEST_COALESCE_WINDOW_MS = 5;
export const DEFAULT_INGEST_COALESCE_MAX_ROWS = 2000;

// Optional backpressure tuning (specs/003-ingestion-backpressure research.md Decisions 2, 6).
// Env-overridable via BACKPRESSURE_MAX_PENDING_ROWS / BACKPRESSURE_MAX_PENDING_BYTES /
// BACKPRESSURE_RETRY_AFTER_SECONDS — starting defaults pending measurement, not fixed
// values. BACKPRESSURE_ENABLED itself has no constant here: it's a plain boolean read
// directly off `process.env.BACKPRESSURE_ENABLED === 'true'`, which is already `false`
// (the documented default, FR-002) for both an unset and any non-'true' value.
export const DEFAULT_BACKPRESSURE_MAX_PENDING_ROWS = 20_000;
export const DEFAULT_BACKPRESSURE_MAX_PENDING_BYTES = '25mb';
export const DEFAULT_BACKPRESSURE_RETRY_AFTER_SECONDS = 1;

// Fixed per-entry overhead folded into the field-length byte-size estimate, covering the
// timestamp value, the level value, and JSON structural punctuation (field-name labels,
// quotes, colons, commas, braces) that summing message/service/attribute lengths alone
// wouldn't otherwise account for (research.md Decision 2) — an estimate, not an exact
// figure; spec.md's Assumptions require only an estimate, not exact on-disk size.
export const ESTIMATED_BYTES_OVERHEAD_PER_LOG_ENTRY = 128;

export const ISO_8601_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export const POSITIVE_INTEGER_PATTERN = /^\d+$/;

export const LOG_QUERY_PARAMETER_NAMES = [
  'service',
  'level',
  'since',
  'until',
  'q',
  'limit',
  'cursor',
] as const;

export const LOG_AGGREGATION_PARAMETER_NAMES = [
  'service',
  'level',
  'since',
  'until',
  'q',
  'bucket',
  'group_by',
] as const;
