import { MILLISECONDS_PER_ROLLUP_BUCKET } from '@/common/constants/retention.constants';

/**
 * Rounds a Date up to the next rollup-bucket (minute) boundary, unchanged if
 * already aligned. Shared by the ingest-side rollup grouping, the
 * aggregation read path (splitting a query range into a rollup-eligible
 * bulk plus raw-scan edges), and retention pruning (the one boundary bucket
 * needing a delta adjustment instead of a bulk delete) so all three can
 * never disagree on where a bucket starts (specs/002-performance-optimization
 * research.md Decisions 6, 7, 9).
 */
export function alignUpToRollupBucket(date: Date): Date {
  const remainderMs = date.getTime() % MILLISECONDS_PER_ROLLUP_BUCKET;
  return remainderMs === 0
    ? date
    : new Date(date.getTime() + (MILLISECONDS_PER_ROLLUP_BUCKET - remainderMs));
}

/** See {@link alignUpToRollupBucket}. */
export function alignDownToRollupBucket(date: Date): Date {
  const remainderMs = date.getTime() % MILLISECONDS_PER_ROLLUP_BUCKET;
  return remainderMs === 0 ? date : new Date(date.getTime() - remainderMs);
}
