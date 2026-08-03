import { BadRequestException, Injectable } from '@nestjs/common';

import { ATTRIBUTE_QUERY_PREFIX } from '@/common/constants/log-api.constants';
import { AggregateLogsDto } from '@/logs/dto/requests/aggregate-logs.dto';
import { QueryLogsDto } from '@/logs/dto/requests/query-logs.dto';
import {
  aggregationBucketSchema,
  attributeFilterKeySchema,
  createSingleStringSchema,
  logAggregationParametersSchema,
  logFilterSchema,
  logQueryLimitSchema,
  logQueryParametersSchema,
  optionalAggregationGroupSchema,
  optionalCursorSchema,
} from '@/logs/validators/log-query.schema';
import { parseWithSchema } from '@/logs/validators/zod-validation.utils';

@Injectable()
export class LogQueryValidator {
  validateQuery(value: unknown): QueryLogsDto {
    const query = parseWithSchema(logQueryParametersSchema, value);
    const filters = parseWithSchema(logFilterSchema, query);
    const dto = new QueryLogsDto();
    Object.assign(dto, filters);
    dto.attributes = this.parseAttributes(query);
    dto.limit = parseWithSchema(logQueryLimitSchema, query.limit);
    dto.cursor = parseWithSchema(optionalCursorSchema, query.cursor);
    return dto;
  }

  validateAggregation(value: unknown): AggregateLogsDto {
    const query = parseWithSchema(logAggregationParametersSchema, value);
    const filters = parseWithSchema(logFilterSchema, query);

    if (!filters.since || !filters.until) {
      throw new BadRequestException('since and until are required');
    }

    const dto = new AggregateLogsDto();
    Object.assign(dto, filters);
    dto.since = filters.since;
    dto.until = filters.until;
    dto.attributes = this.parseAttributes(query);
    dto.bucket = parseWithSchema(aggregationBucketSchema, query.bucket);
    dto.groupBy = parseWithSchema(
      optionalAggregationGroupSchema,
      query.group_by,
    );
    return dto;
  }

  private parseAttributes(
    query: Record<string, unknown>,
  ): Record<string, string> {
    const attributes: Record<string, string> = {};

    for (const [key, value] of Object.entries(query)) {
      if (!key.startsWith(ATTRIBUTE_QUERY_PREFIX)) {
        continue;
      }

      const attributeKey = parseWithSchema(
        attributeFilterKeySchema,
        key.slice(ATTRIBUTE_QUERY_PREFIX.length),
      );
      attributes[attributeKey] = parseWithSchema(
        createSingleStringSchema(key),
        value,
      );
    }

    return attributes;
  }
}
