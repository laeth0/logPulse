import { z } from 'zod';

import {
  LOG_ID_PATTERN,
  MAX_LOG_ID,
} from '@/common/constants/log-api.constants';
import { createIsoTimestampSchema } from '@/logs/validators/iso-timestamp.schema';

const cursorIdSchema = z
  .string()
  .refine((id) => LOG_ID_PATTERN.test(id) && BigInt(id) <= MAX_LOG_ID);

export const cursorPayloadSchema = z.object({
  timestamp: createIsoTimestampSchema('Invalid cursor timestamp'),
  id: cursorIdSchema,
});
