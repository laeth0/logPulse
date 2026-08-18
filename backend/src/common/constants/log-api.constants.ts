export const DEFAULT_LOG_QUERY_LIMIT = 100;
export const MAX_LOG_QUERY_LIMIT = 1000;
export const MAX_FUTURE_TIMESTAMP_OFFSET_MS = 5 * 60 * 1000;
export const ATTRIBUTE_QUERY_PREFIX = 'attr.';
export const MAX_LOG_ID = 9_223_372_036_854_775_807n;
export const LOG_ID_PATTERN = /^[1-9]\d{0,18}$/;

export const DEFAULT_INGEST_COALESCE_WINDOW_MS = 5;
export const DEFAULT_INGEST_COALESCE_MAX_ROWS = 2000;

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
