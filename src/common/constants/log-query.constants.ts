export const LOG_AGGREGATION_ORIGIN = "TIMESTAMPTZ '1970-01-01 00:00:00+00'";

export const LOG_AGGREGATION_BUCKET_INTERVALS = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '1h': '1 hour',
  '1d': '1 day',
} as const;

export const LOG_AGGREGATION_GROUP_COLUMNS = {
  service: 'service',
  level: 'level',
} as const;
