import { z } from 'zod';

import { ISO_8601_TIMESTAMP_PATTERN } from '@/common/constants/log-api.constants';

export function createIsoTimestampSchema(errorMessage: string) {
  return z
    .string({ error: errorMessage })
    .regex(ISO_8601_TIMESTAMP_PATTERN, { error: errorMessage })
    .pipe(
      z.iso.datetime({
        offset: true,
        error: errorMessage,
      }),
    );
}
