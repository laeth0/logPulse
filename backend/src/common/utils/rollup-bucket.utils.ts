import { MILLISECONDS_PER_ROLLUP_BUCKET } from '@/common/constants/retention.constants';

export function alignUpToRollupBucket(date: Date): Date {
  const remainderMs = date.getTime() % MILLISECONDS_PER_ROLLUP_BUCKET;
  return remainderMs === 0
    ? date
    : new Date(date.getTime() + (MILLISECONDS_PER_ROLLUP_BUCKET - remainderMs));
}

export function alignDownToRollupBucket(date: Date): Date {
  const remainderMs = date.getTime() % MILLISECONDS_PER_ROLLUP_BUCKET;
  return remainderMs === 0 ? date : new Date(date.getTime() - remainderMs);
}
