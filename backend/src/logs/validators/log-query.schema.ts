import { z } from 'zod';

import {
  ATTRIBUTE_QUERY_PREFIX,
  DEFAULT_LOG_QUERY_LIMIT,
  LOG_AGGREGATION_PARAMETER_NAMES,
  LOG_QUERY_PARAMETER_NAMES,
  MAX_LOG_QUERY_LIMIT,
  POSITIVE_INTEGER_PATTERN,
} from '@/common/constants/log-api.constants';
import { AggregationBucket } from '@/logs/enums/aggregation-bucket.enum';
import { AggregationGroup } from '@/logs/enums/aggregation-group.enum';
import { LogLevel } from '@/logs/enums/log-level.enum';
import { createIsoTimestampSchema } from '@/logs/validators/iso-timestamp.schema';

function createParametersSchema(allowedParameters: readonly string[]) {
  return z
    .record(z.string(), z.unknown(), {
      error: 'query parameters must be an object',
    })
    .superRefine((parameters, context) => {
      for (const parameter of Object.keys(parameters)) {
        if (
          !allowedParameters.includes(parameter) &&
          !parameter.startsWith(ATTRIBUTE_QUERY_PREFIX)
        ) {
          context.addIssue({
            code: 'custom',
            message: `unsupported query parameter: '${parameter}'`,
          });
          return;
        }
      }
    });
}

export function createSingleStringSchema(name: string) {
  return z.string({ error: `${name} must be a single string value` });
}

function createTimestampSchema(name: string) {
  const invalidTimestampMessage = `${name} must be a valid ISO 8601 timestamp`;

  return createIsoTimestampSchema(invalidTimestampMessage).transform(
    (timestamp) => new Date(timestamp),
  );
}

const filterSchema = z
  .object({
    service: createSingleStringSchema('service').optional(),
    level: z
      .enum(LogLevel, {
        error: 'level must be one of: debug, info, warn, error',
      })
      .optional(),
    since: createTimestampSchema('since').optional(),
    until: createTimestampSchema('until').optional(),
    q: createSingleStringSchema('q').optional(),
  })
  .superRefine((filters, context) => {
    if (
      filters.since &&
      filters.until &&
      filters.until.getTime() < filters.since.getTime()
    ) {
      context.addIssue({
        code: 'custom',
        path: ['until'],
        message: 'until must not be earlier than since',
      });
    }
  });

export const logQueryParametersSchema = createParametersSchema(
  LOG_QUERY_PARAMETER_NAMES,
);

export const logAggregationParametersSchema = createParametersSchema(
  LOG_AGGREGATION_PARAMETER_NAMES,
);

export const logFilterSchema = filterSchema;

export const logQueryLimitSchema = createSingleStringSchema('limit')
  .regex(POSITIVE_INTEGER_PATTERN, {
    error: 'limit must be a positive integer',
  })
  .transform(Number)
  .refine((limit) => limit >= 1 && limit <= MAX_LOG_QUERY_LIMIT, {
    error: `limit must be between 1 and ${MAX_LOG_QUERY_LIMIT}`,
  })
  .optional()
  .default(DEFAULT_LOG_QUERY_LIMIT);

export const optionalCursorSchema =
  createSingleStringSchema('cursor').optional();

export const attributeFilterKeySchema = z.string().min(1, {
  error: 'attribute filter key must not be empty',
});

export const aggregationBucketSchema = z.enum(AggregationBucket, {
  error: 'bucket must be one of: 1m, 5m, 1h, 1d',
});

export const optionalAggregationGroupSchema = z
  .enum(AggregationGroup, {
    error: 'group_by must be service or level',
  })
  .optional();
