import { z } from 'zod';

import { MAX_FUTURE_TIMESTAMP_OFFSET_MS } from '@/common/constants/log-api.constants';
import { LogLevel } from '@/logs/enums/log-level.enum';
import { createIsoTimestampSchema } from '@/logs/validators/iso-timestamp.schema';

const INVALID_TIMESTAMP_MESSAGE =
  'timestamp must be a valid ISO 8601 timestamp';

const timestampSchema = createIsoTimestampSchema(
  INVALID_TIMESTAMP_MESSAGE,
).refine(
  (timestamp) =>
    Date.parse(timestamp) <= Date.now() + MAX_FUTURE_TIMESTAMP_OFFSET_MS,
  {
    error: 'timestamp must not be more than five minutes in the future',
  },
);

const attributeValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
]);

export const logBatchSchema = z.object(
  {
    logs: z
      .array(z.unknown(), {
        error: 'request body must contain a logs array',
      })
      .min(1, { error: 'logs must contain at least one entry' }),
  },
  { error: 'request body must contain a logs array' },
);

export const logEntrySchema = z.object(
  {
    timestamp: timestampSchema,
    level: z.enum(LogLevel),
    service: z
      .string({ error: 'service must be a non-empty string' })
      .refine((service) => service.trim().length > 0, {
        error: 'service must be a non-empty string',
      }),
    message: z
      .string({ error: 'message must be a non-empty string' })
      .refine((message) => message.trim().length > 0, {
        error: 'message must be a non-empty string',
      }),
    attributes: z
      .record(z.string(), attributeValueSchema, {
        error: 'attributes must be a flat object',
      })
      .optional()
      .default({}),
  },
  { error: 'log entry must be an object' },
);
