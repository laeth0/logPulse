import { MILLISECONDS_PER_ROLLUP_BUCKET } from '@/common/constants/retention.constants';

/**
 * Aligns a date up (ceiling) to the next rollup bucket boundary.
 * If the date already falls exactly on a boundary, returns the date unmodified.
 *
 * @param date - The input timestamp to align.
 * @returns A new `Date` aligned up to the nearest rollup bucket boundary.
 */
export function alignUpToRollupBucket(date: Date): Date {
  const remainderMs = date.getTime() % MILLISECONDS_PER_ROLLUP_BUCKET;
  return remainderMs === 0
    ? date
    : new Date(date.getTime() + (MILLISECONDS_PER_ROLLUP_BUCKET - remainderMs));
}

/**
 * Aligns a date down (floor) to the previous rollup bucket boundary.
 * If the date already falls exactly on a boundary, returns the date unmodified.
 *
 * @param date - The input timestamp to align.
 * @returns A new `Date` aligned down to the nearest rollup bucket boundary.
 */
export function alignDownToRollupBucket(date: Date): Date {
  const remainderMs = date.getTime() % MILLISECONDS_PER_ROLLUP_BUCKET;
  return remainderMs === 0 ? date : new Date(date.getTime() - remainderMs);
}
