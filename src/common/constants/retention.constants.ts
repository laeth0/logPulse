export const DEFAULT_LOG_RETENTION_DAYS = 30;
export const MAX_LOG_RETENTION_DAYS = 365;

export const DEFAULT_LOG_PARTITION_DAYS_AHEAD = 7;
export const MAX_LOG_PARTITION_DAYS_AHEAD = 90;

export const MILLISECONDS_PER_DAY = 86_400_000;

// Rollup bucket granularity (specs/002-performance-optimization research.md Decision 4) —
// one minute, matching GET /logs/aggregate's finest supported bucket size (1m). Shared by
// the ingest-side rollup upsert (grouping a flushed batch) and the retention-side pruning
// (aligning the cutoff to a bucket boundary), so the two can never disagree on bucket edges.
export const MILLISECONDS_PER_ROLLUP_BUCKET = 60_000;

// Two-key PostgreSQL advisory lock namespace for retention maintenance.
export const LOG_RETENTION_LOCK_NAMESPACE = 1_819_243_079;
export const LOG_RETENTION_LOCK_ID = 1;

export const DAILY_PARTITION_NAME_PATTERN = /^logs_(\d{4})_(\d{2})_(\d{2})$/;
